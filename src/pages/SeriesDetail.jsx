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

  // Admin inline editing state
  const [editingIssueId, setEditingIssueId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', issueNumber: '' });

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

  function startEdit(issue, e) {
    if (e) e.preventDefault();
    setEditingIssueId(issue.id);
    setEditForm({ title: issue.title || '', issueNumber: issue.issue_number });
  }

  async function saveEdit(e) {
    if (e) e.preventDefault();
    try {
      await fetchApi(`/series/issue/${editingIssueId}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });
      setEditingIssueId(null);
      fetchSeries();
    } catch (err) {
      console.error('Save failed:', err);
    }
  }

  async function deleteIssue(issueId, e) {
    if (e) e.preventDefault();
    if (!confirm('Are you sure you want to permanently delete this issue and all its pages?')) return;
    try {
      await fetchApi(`/series/issue/${issueId}`, { method: 'DELETE' });
      fetchSeries();
    } catch (err) {
      console.error('Delete failed:', err);
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
            {session?.user?.isAdmin && (
              <>
                <Link to={`/upload?seriesId=${series.id}`} className="btn btn-secondary">Add Issue</Link>
                <button className="btn btn-danger" onClick={deleteSeries}>Delete Series</button>
              </>
            )}
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
                style={{ animationDelay: `${i * 0.05}s`, position: 'relative' }}
              >
                <div className="issue-number">#{issue.issue_number}</div>
                <div className="issue-info" style={{ flex: 1 }}>
                  {editingIssueId === issue.id ? (
                    <div className="edit-issue-form" onClick={e => e.preventDefault()} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <input 
                        type="number" 
                        value={editForm.issueNumber} 
                        onChange={e => setEditForm({...editForm, issueNumber: e.target.value})}
                        style={{ width: '60px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', background: '#222', color: 'white' }}
                      />
                      <input 
                        type="text" 
                        value={editForm.title} 
                        placeholder="Issue Title"
                        onChange={e => setEditForm({...editForm, title: e.target.value})}
                        style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #ccc', background: '#222', color: 'white' }}
                      />
                      <button onClick={saveEdit} className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '13px' }}>Save</button>
                      <button onClick={() => setEditingIssueId(null)} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '13px' }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <h3 className="issue-title">{issue.title || `Issue #${issue.issue_number}`}</h3>
                      <p className="issue-meta">{issue.page_count} pages</p>
                    </>
                  )}
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
                {session?.user?.isAdmin && editingIssueId !== issue.id && (
                  <div className="admin-issue-actions" onClick={e => e.preventDefault()} style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
                    <button onClick={(e) => startEdit(issue, e)} title="Edit Issue" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: '14px', borderRadius: '4px', padding: '4px 8px' }}>✏️</button>
                    <button onClick={(e) => deleteIssue(issue.id, e)} title="Delete Issue" style={{ background: 'rgba(255,50,50,0.2)', border: 'none', cursor: 'pointer', fontSize: '14px', borderRadius: '4px', padding: '4px 8px' }}>🗑️</button>
                  </div>
                )}
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
