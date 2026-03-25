import { useState } from 'react';
import { auth } from '../lib/api';
import './Login.css';

function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isSignUp) {
        await auth.signUp(email, password);
        setMessage('Account created! You can now sign in.');
        setIsSignUp(false);
      } else {
        await auth.signIn(email, password);
        // Page reload to apply session globally since we removed auth listeners
        window.location.reload();
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-bg-glow"></div>

      <div className="login-card glass-card animate-slide-up">
        <div className="login-header">
          <span className="login-icon">📚</span>
          <h1 className="login-title">ComicVault</h1>
          <p className="login-subtitle">
            {isSignUp ? 'Create your account' : 'Sign in to your library'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-message">{message}</div>}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner"></span> Loading...</>
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        <div className="login-toggle">
          <span className="toggle-text">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </span>
          <button
            className="toggle-btn"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
