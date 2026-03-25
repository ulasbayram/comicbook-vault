import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import ComicCard from '../components/ComicCard';
import './Home.css';

function Home({ session }) {
  const [series, setSeries] = useState([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const categories = [
    { key: 'all', label: 'All', icon: '📚' },
    { key: 'comic', label: 'Comics', icon: '💥' },
    { key: 'webtoon', label: 'Webtoons', icon: '📱' },
    { key: 'manga', label: 'Manga', icon: '🎌' },
  ];

  useEffect(() => {
    fetchSeries();
  }, [category, search]);

  async function fetchSeries() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (category !== 'all') qs.append('category', category);
      if (search) qs.append('search', search);

      const data = await fetchApi(`/series?${qs.toString()}`);
      setSeries(data || []);
    } catch (err) {
      console.error('Failed to fetch series:', err);
    }
    setLoading(false);
  }

  return (
    <div className="home-page container">
      <header className="home-header animate-fade-in">
        <h1 className="home-title">
          Your <span className="gradient-text">Library</span>
        </h1>
        <p className="home-subtitle">Browse your comic collection</p>
      </header>

      <div className="home-controls animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="category-tabs">
          {categories.map(cat => (
            <button
              key={cat.key}
              className={`tab-btn ${category === cat.key ? 'active' : ''}`}
              onClick={() => setCategory(cat.key)}
            >
              <span className="tab-icon">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        <div className="search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="7" cy="7" r="4" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            placeholder="Search comics..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="comics-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="comic-card-skeleton">
              <div className="skeleton" style={{ aspectRatio: '2/3' }} />
              <div style={{ padding: '1rem' }}>
                <div className="skeleton" style={{ height: '12px', width: '40%', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '16px', width: '80%', marginBottom: '6px' }} />
                <div className="skeleton" style={{ height: '12px', width: '30%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : series.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="empty-icon">📖</div>
          <h2>No comics yet</h2>
          <p>Upload your first comic to get started!</p>
          <a href="/upload" className="btn btn-primary" style={{ marginTop: '1rem' }}>Upload Comic</a>
        </div>
      ) : (
        <div className="comics-grid">
          {series.map((s, i) => (
            <ComicCard key={s.id} series={s} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
