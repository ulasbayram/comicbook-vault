import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import './SeriesDetail.css';

function SeriesDetail({ session }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [series, setSeries] = useState(null);
  const [issues, setIssues] = useState([]);
  const [coverUrl, setCoverUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const categoryLabels = {
    comic: 'Comic',
    webtoon: 'Webtoon',
    manga: 'Manga'
  };

  useEffect(() => {
    fetchSeries();
  }, [id]);

  async function fetchSeries() {
    setLoading(true);
    try {
      // Get series
      const seriesData = await fetchApi(`/series/${id}`);
      setSeries(seriesData);

      // Get cover URL
      if (seriesData.cover_url) {
        fetch(`/api/images/cover/${id}`)
          .then(r => r.json())
          .then(data => setCoverUrl(data.url))
          .catch(() => {});
      }

      // Get issues with reading progress from backend
      const issuesWithProgress = await fetchApi(`/series/${id}/issues`);
      setIssues(issuesWithProgress || []);
    } catch (err) {
      console.error('Failed to fetch series:', err);
    }
    setLoading(false);
  }

  async function deleteSeries() {
    if (!confirm('Delete this series and all its issues?')) return;
    try {
      await fetchApi(`/series/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  if (loading) {
    return (
      <div className="series-detail container">
        <div className="series-hero">
          <div className="skeleton" style={{ width: 200, height: 300, borderRadius: '1rem' }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 20, width: '30%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 16, width: '80%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="series-detail container">
        <div className="empty-state">
          <h2>Series not found</h2>
          <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>Back to Library</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="series-detail container">
      <Link to="/" className="back-link animate-fade-in">← Back to Library</Link>

      <div className="series-hero animate-slide-up">
        <div className="series-cover">
          {coverUrl ? (
            <img src={coverUrl} alt={series.title} />
          ) : (
            <div className="cover-placeholder">📖</div>
          )}
        </div>

        <div className="series-info">
          <span className={`category-badge ${series.category}`}>
            {categoryLabels[series.category] || series.category}
          </span>
          <h1 className="series-title">{series.title}</h1>
          {series.description && <p className="series-description">{series.description}</p>}
          <div className="series-stats">
            <span className="stat"><strong>{issues.length}</strong> Issues</span>
          </div>
          <div className="series-actions">
            {issues.length > 0 && (
              <Link to={`/read/${issues[0].id}`} className="btn btn-primary">Start Reading</Link>
            )}
            <Link to={`/upload?seriesId=${series.id}`} className="btn btn-secondary">Add Issue</Link>
            <button className="btn btn-danger" onClick={deleteSeries}>Delete Series</button>
          </div>
        </div>
      </div>

      <section className="issues-section animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <h2 className="section-title">Issues</h2>
        {issues.length === 0 ? (
          <p className="no-issues">No issues yet. Upload one to get started!</p>
        ) : (
          <div className="issues-grid">
            {issues.map((issue, i) => (
              <Link
                to={`/read/${issue.id}`}
                key={issue.id}
                className="issue-card glass-card animate-slide-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="issue-number">#{issue.issue_number}</div>
                <div className="issue-info">
                  <h3 className="issue-title">{issue.title || `Issue #${issue.issue_number}`}</h3>
                  <p className="issue-meta">{issue.page_count} pages</p>
                  {issue.current_page && issue.current_page > 1 && (
                    <div className="issue-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.round((issue.current_page / issue.page_count) * 100)}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        {Math.round((issue.current_page / issue.page_count) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="issue-arrow">→</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default SeriesDetail;
