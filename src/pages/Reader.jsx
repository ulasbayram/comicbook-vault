import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { fetchApi } from '../lib/api';
import './Reader.css';

function Reader({ session }) {
  const { issueId } = useParams();

  const [issue, setIssue] = useState(null);
  const [series, setSeries] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showUI, setShowUI] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const uiTimeoutRef = useRef(null);
  const observerRef = useRef(null);

  // Fetch issue data + presigned image URLs
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Get issue info
        const issueData = await fetchApi(`/series/issue/${issueId}`);
        if (issueData) {
          setIssue(issueData);
          setSeries(issueData.series);
        }

        // Get reading progress
        const progress = await fetchApi(`/progress/${issueId}`).catch(() => null);
        if (progress?.current_page) setCurrentPage(progress.current_page);

        // Get pages with presigned URLs from backend
        const pagesData = await fetchApi(`/images/issue/${issueId}`);
        setPages(pagesData);
      } catch (err) {
        console.error('Failed to load issue:', err);
      }
      setLoading(false);
    }
    load();
  }, [issueId]);

  // Intersection observer for page tracking
  useEffect(() => {
    if (!pages.length) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const pageNum = parseInt(entry.target.dataset.page);
            if (pageNum) setCurrentPage(pageNum);
          }
        });
      },
      { threshold: 0.5 }
    );

    Object.values(pageRefs.current).forEach(el => {
      if (el) observerRef.current.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [pages]);

  // Save progress
  useEffect(() => {
    if (!pages.length || currentPage <= 1) return;
    const timer = setTimeout(async () => {
      await fetchApi('/progress', {
        method: 'POST',
        body: { issue_id: issueId, current_page: currentPage }
      }).catch(console.error);
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentPage, issueId, pages]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeydown(e) {
      const total = pages.length;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToPage(Math.min(currentPage + 1, total));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPage(Math.max(currentPage - 1, 1));
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        document.exitFullscreen?.();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [currentPage, pages, isFullscreen]);

  // Auto-hide UI
  function resetUITimeout() {
    setShowUI(true);
    clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = setTimeout(() => setShowUI(false), 3000);
  }

  useEffect(() => {
    resetUITimeout();
    return () => clearTimeout(uiTimeoutRef.current);
  }, []);

  function goToPage(pageNum) {
    const el = pageRefs.current[pageNum];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setCurrentPage(pageNum);
    resetUITimeout();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  // Scroll to saved page on load
  useEffect(() => {
    if (pages.length && currentPage > 1) {
      setTimeout(() => goToPage(currentPage), 300);
    }
  }, [pages]);

  if (loading) {
    return (
      <div className="reader-loading">
        <div className="spinner-large"></div>
        <p>Loading comic...</p>
      </div>
    );
  }

  const totalPages = pages.length;

  return (
    <div
      className={`reader ${isFullscreen ? 'fullscreen' : ''}`}
      ref={containerRef}
      onMouseMove={resetUITimeout}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const third = rect.width / 3;
        if (x < third) goToPage(Math.max(currentPage - 1, 1));
        else if (x > third * 2) goToPage(Math.min(currentPage + 1, totalPages));
        else setShowUI(prev => !prev);
      }}
    >
      <div className={`reader-topbar ${showUI ? 'visible' : ''}`}>
        <Link to={series ? `/series/${series.id}` : '/'} className="reader-back"
          onClick={e => e.stopPropagation()}>← Back</Link>
        <div className="reader-title">
          <span className="reader-series-name">{series?.title}</span>
          <span className="reader-issue-name">{issue?.title || `Issue #${issue?.issue_number}`}</span>
        </div>
        <button className="fullscreen-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
          title="Toggle Fullscreen (F)">{isFullscreen ? '⊡' : '⊞'}</button>
      </div>

      <div className="reader-pages">
        {pages.map((page) => (
          <div
            key={page.id}
            className={`reader-page ${page.is_double_spread ? 'double-spread' : ''}`}
            ref={el => pageRefs.current[page.page_number] = el}
            data-page={page.page_number}
          >
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={4}
              centerZoomedOut={true}
              wheel={{ step: 0.15 }}
              doubleClick={{ step: 1.5 }}
              panning={{ disabled: false }}
            >
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={page.image_url}
                  alt={`Page ${page.page_number}`}
                  loading="lazy"
                  className="page-image"
                  draggable="false"
                />
              </TransformComponent>
            </TransformWrapper>
          </div>
        ))}
      </div>

      <div className={`reader-bottombar ${showUI ? 'visible' : ''}`}>
        <span className="page-indicator">{currentPage} / {totalPages}</span>
        <input type="range" className="page-slider" min="1" max={totalPages} value={currentPage}
          onChange={e => { e.stopPropagation(); goToPage(parseInt(e.target.value)); }}
          onClick={e => e.stopPropagation()} />
        <div className="reader-controls" onClick={e => e.stopPropagation()}>
          <button className="nav-btn" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>‹</button>
          <button className="nav-btn" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>›</button>
        </div>
      </div>
    </div>
  );
}

export default Reader;
