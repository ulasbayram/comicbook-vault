import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import './Upload.css';

function Upload({ session }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [existingSeries, setExistingSeries] = useState([]);
  const [mode, setMode] = useState(searchParams.get('seriesId') ? 'existing' : 'new');
  const [form, setForm] = useState({
    seriesId: searchParams.get('seriesId') || '',
    seriesTitle: '',
    category: 'comic',
    issueNumber: '1',
    issueTitle: '',
    description: ''
  });
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSeriesList();
  }, []);

  async function fetchSeriesList() {
    try {
      const data = await fetchApi('/series');
      setExistingSeries(data || []);
    } catch {
      setExistingSeries([]);
    }
  }

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      const f = e.dataTransfer.files[0];
      const ext = f.name.split('.').pop().toLowerCase();
      if (['pdf', 'cbz', 'cbr', 'zip', 'rar'].includes(ext)) {
        setFile(f);
        setError('');
      } else {
        setError('Only PDF, CBZ, and CBR files are accepted');
      }
    }
  }

  function handleFileSelect(e) {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }

    setUploading(true);
    setProgress('Uploading file...');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', session.user.id);

      if (mode === 'new') {
        formData.append('seriesTitle', form.seriesTitle);
        formData.append('seriesId', 'new');
        formData.append('category', form.category);
        formData.append('description', form.description);
      } else {
        formData.append('seriesId', form.seriesId);
      }
      formData.append('issueNumber', form.issueNumber);
      formData.append('issueTitle', form.issueTitle);

      setProgress('Processing pages and uploading to library...');

      const data = await fetchApi('/upload', {
        method: 'POST',
        body: formData
      });

      setProgress(`Done! ${data.pageCount} pages processed.`);
      setTimeout(() => navigate(`/series/${data.seriesId}`), 1000);
    } catch (err) {
      setError(err.message);
      setProgress('');
    }
    setUploading(false);
  }

  return (
    <div className="upload-page container">
      <header className="upload-header animate-fade-in">
        <h1 className="upload-title">Upload <span className="gradient-text">Comic</span></h1>
        <p className="upload-subtitle">Add a new comic, webtoon, or manga to your library</p>
      </header>

      <form className="upload-form glass-card animate-slide-up" onSubmit={handleSubmit}>
        <div className="form-section">
          <label className="form-label">Series</label>
          <div className="mode-toggle">
            <button type="button" className={`toggle-btn ${mode === 'new' ? 'active' : ''}`} onClick={() => {
              setMode('new');
              setForm(f => ({ ...f, issueNumber: '1', seriesId: 'new' }));
            }}>
              New Series
            </button>
            <button type="button" className={`toggle-btn ${mode === 'existing' ? 'active' : ''}`}
              onClick={() => setMode('existing')} disabled={existingSeries.length === 0}>
              Existing Series
            </button>
          </div>
        </div>

        {mode === 'new' ? (
          <>
            <div className="form-group">
              <label className="form-label">Series Title *</label>
              <input type="text" required placeholder="e.g. Spider-Man, One Piece..."
                value={form.seriesTitle} onChange={e => setForm(f => ({ ...f, seriesTitle: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Category *</label>
              <div className="category-select">
                {['comic', 'webtoon', 'manga'].map(cat => (
                  <button type="button" key={cat}
                    className={`category-option ${form.category === cat ? 'active' : ''} ${cat}`}
                    onClick={() => setForm(f => ({ ...f, category: cat }))}>
                    <span className="cat-icon">{cat === 'comic' ? '💥' : cat === 'webtoon' ? '📱' : '🎌'}</span>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea placeholder="Brief description..." rows="3"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </>
        ) : (
          <div className="form-group">
            <label className="form-label">Select Series *</label>
            <select required value={form.seriesId} onChange={(e) => {
              const selectedId = e.target.value;
              const selectedSeries = existingSeries.find(s => s.id === selectedId);
              setForm(f => ({
                ...f, 
                seriesId: selectedId,
                issueNumber: selectedSeries ? String((selectedSeries.issue_count || 0) + 1) : '1'
              }));
            }}>
              <option value="">Choose a series...</option>
              {existingSeries.map(s => (<option key={s.id} value={s.id}>{s.title}</option>))}
            </select>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Issue Number *</label>
            <input type="number" required min="1" value={form.issueNumber}
              onChange={e => setForm(f => ({ ...f, issueNumber: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Issue Title</label>
            <input type="text" placeholder="Optional title..."
              value={form.issueTitle} onChange={e => setForm(f => ({ ...f, issueTitle: e.target.value }))} />
          </div>
        </div>

        <div className="form-section">
          <label className="form-label">Comic File *</label>
          <div className={`drop-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag}
            onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".pdf,.cbz,.cbr,.zip,.rar"
              onChange={handleFileSelect} style={{ display: 'none' }} />
            {file ? (
              <div className="file-preview">
                <div className="file-icon">📄</div>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
                <button type="button" className="remove-file"
                  onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
              </div>
            ) : (
              <div className="drop-content">
                <div className="drop-icon">📁</div>
                <p className="drop-text"><strong>Drag & drop</strong> your comic file here</p>
                <p className="drop-hint">PDF, CBZ, CBR supported</p>
              </div>
            )}
          </div>
        </div>

        {error && <div className="upload-error">{error}</div>}
        {progress && <div className="upload-progress">{progress}</div>}

        <button type="submit" className="btn btn-primary submit-btn" disabled={uploading}>
          {uploading ? (<><span className="spinner"></span>Processing...</>) : 'Upload & Process'}
        </button>
      </form>
    </div>
  );
}

export default Upload;
