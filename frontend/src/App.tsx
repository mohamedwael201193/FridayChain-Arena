import { Routes, Route } from 'react-router-dom';
import { ArenaProvider } from './hooks/useArena';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import GamePlayPage from './pages/GamePlayPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  return (
    <ArenaProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<GamePlayPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </Layout>
    </ArenaProvider>
  );
}
