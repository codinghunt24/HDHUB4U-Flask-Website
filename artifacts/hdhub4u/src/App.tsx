import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import Home from './pages/home';
import CategoryPage from './pages/category';
import PostPage from './pages/post';
import AboutPage from './pages/about';
import PolicyPage from './pages/policy';
import AdminLogin from './pages/admin-login';
import AdminDashboard from './pages/admin-dashboard';
import AdminPosts from './pages/admin-posts';
import AdminFetch from './pages/admin-fetch';
import AdminCategories from './pages/admin-categories';
import AdminSettings from './pages/admin-settings';
import AdminSitemap from './pages/admin-sitemap';
import AdminAnalytics from './pages/admin-analytics'; // will create a stub mapping to settings/analytics idea

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Public Routes */}
        <Route path="/" component={Home} />
        <Route path="/category/:slug" component={CategoryPage} />
        <Route path="/post/:slug" component={PostPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact">
          {() => (
            <PolicyPage title="Contact Us">
              <p>For inquiries, please reach out to us at our official contact channels.</p>
              <p>Email: admin@hdhub4u.com</p>
            </PolicyPage>
          )}
        </Route>
        <Route path="/privacy-policy">
          {() => (
            <PolicyPage title="Privacy Policy">
              <p>We respect your privacy. This metadata index does not collect personal data beyond standard server logs and optional analytics.</p>
            </PolicyPage>
          )}
        </Route>
        <Route path="/disclaimer">
          {() => (
            <PolicyPage title="Disclaimer">
              <p>This site serves strictly as an informational catalog. We do not host copyrighted material on our servers. All external links are provided for indexing and informational purposes only.</p>
            </PolicyPage>
          )}
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" component={AdminLogin} />
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/posts" component={AdminPosts} />
        <Route path="/admin/fetch" component={AdminFetch} />
        <Route path="/admin/categories" component={AdminCategories} />
        <Route path="/admin/analytics" component={AdminAnalytics} />
        <Route path="/admin/sitemap" component={AdminSitemap} />
        <Route path="/admin/settings" component={AdminSettings} />

        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'HDHUB4U — Latest Entertainment Updates & Guides',
      '/about': 'About HDHUB4U — Our Editorial Mission',
      '/contact': 'Contact HDHUB4U',
      '/privacy-policy': 'Privacy Policy — HDHUB4U',
      '/disclaimer': 'Disclaimer — HDHUB4U',
      '/admin': 'Admin Login — HDHUB4U',
    };
    const routeTitle = location.startsWith('/category/')
      ? 'Entertainment Category — HDHUB4U'
      : location.startsWith('/post/')
        ? 'Entertainment Story — HDHUB4U'
        : location.startsWith('/admin/')
          ? 'Admin Workspace — HDHUB4U'
          : titles[location];
    document.title = routeTitle ?? 'HDHUB4U';
  }, [location]);
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
