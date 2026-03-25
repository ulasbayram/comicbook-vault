import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth } from './lib/api';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import SeriesDetail from './pages/SeriesDetail';
import Reader from './pages/Reader';
import Upload from './pages/Upload';
import Login from './pages/Login';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    auth.getSession().then((session) => {
      setSession(session);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner-large"></div>
        <p>Loading ComicVault...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/read/:issueId" element={<Reader session={session} />} />
          <Route path="*" element={
            <>
              <Navbar session={session} />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Home session={session} />} />
                  <Route path="/series/:id" element={<SeriesDetail session={session} />} />
                  <Route path="/upload" element={<Upload session={session} />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </main>
            </>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
