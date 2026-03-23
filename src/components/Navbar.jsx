import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Navbar.css';

function Navbar({ session }) {
  const location = useLocation();
  const userEmail = session?.user?.email || '';

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">📚</span>
          <span className="brand-text">ComicVault</span>
        </Link>

        <div className="navbar-links">
          <Link
            to="/"
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          >
            Library
          </Link>
          <Link
            to="/upload"
            className={`nav-link upload-link ${location.pathname === '/upload' ? 'active' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
            Upload
          </Link>

          <div className="user-menu">
            <span className="user-email">{userEmail.split('@')[0]}</span>
            <button className="logout-btn" onClick={handleLogout} title="Sign Out">
              ↪
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
