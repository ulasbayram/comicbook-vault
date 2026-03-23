import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './ComicCard.css';

function ComicCard({ series, index }) {
  const [coverUrl, setCoverUrl] = useState(null);

  const categoryLabels = {
    comic: 'Comic',
    webtoon: 'Webtoon',
    manga: 'Manga'
  };

  useEffect(() => {
    if (series.cover_url) {
      fetch(`/api/images/cover/${series.id}`)
        .then(r => r.json())
        .then(data => setCoverUrl(data.url))
        .catch(() => {});
    }
  }, [series.id, series.cover_url]);

  return (
    <Link
      to={`/series/${series.id}`}
      className="comic-card glass-card animate-slide-up"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt={series.title} loading="lazy" />
        ) : (
          <div className="card-cover-placeholder">
            <span className="placeholder-icon">📖</span>
          </div>
        )}
        <div className="card-cover-overlay">
          <span className="read-label">Read →</span>
        </div>
      </div>

      <div className="card-info">
        <span className={`category-badge ${series.category}`}>
          {categoryLabels[series.category] || series.category}
        </span>
        <h3 className="card-title">{series.title}</h3>
        <p className="card-meta">
          {series.issue_count || 0} {(series.issue_count || 0) === 1 ? 'Issue' : 'Issues'}
        </p>
      </div>
    </Link>
  );
}

export default ComicCard;
