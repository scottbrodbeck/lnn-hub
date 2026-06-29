import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RoleBasedRedirect } from "@/components/RoleBasedRedirect";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { ClientLayout } from "@/components/layouts/ClientLayout";
import { SalesLayout } from "@/components/layouts/SalesLayout";
import SalesPipeline from "./pages/sales/SalesPipeline";
import SalesDeals from "./pages/sales/SalesDeals";
import SalesOrganizations from "./pages/sales/SalesOrganizations";
import SalesContacts from "./pages/sales/SalesContacts";
import SalesProducts from "./pages/sales/SalesProducts";
import SalesActivities from "./pages/sales/SalesActivities";
import SalesSettings from "./pages/sales/SalesSettings";
import SalesTesting from "./pages/sales/SalesTesting";
import SalesAssignmentDefaults from "./pages/sales/SalesAssignmentDefaults";
import SalesBundleComposition from "./pages/sales/SalesBundleComposition";
import Auth from "./pages/Auth";
import SelectOrganization from "./pages/SelectOrganization";
import AdminTasks from "./pages/admin/AdminTasks";
import AdminClients from "./pages/admin/AdminClients";
import AdminCalendar from "./pages/admin/AdminCalendar";
import AdminAssignments from "./pages/admin/AdminAssignments";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminUserActivity from "./pages/admin/AdminUserActivity";
import AdminActivity from "./pages/admin/AdminActivity";
import ClientPosts from "./pages/client/ClientPosts";
import ClientSubmitPost from "./pages/client/ClientSubmitPost";
import ClientDrafts from "./pages/client/ClientDrafts";
import ClientEditPost from "./pages/client/ClientEditPost";
import ClientSettings from "./pages/client/ClientSettings";
import ClientGuide from "./pages/client/ClientGuide";
import ClientEmailBlasts from "./pages/client/ClientEmailBlasts";
import ClientSubmitBlast from "./pages/client/ClientSubmitBlast";
import ClientSubmitSponsorship from "./pages/client/ClientSubmitSponsorship";
import ClientDisplayAds from "./pages/client/ClientDisplayAds";
import AdminDirectPublish from "./pages/admin/AdminDirectPublish";
import AdminDirectBlast from "./pages/admin/AdminDirectBlast";
import AdminDisplayAds from "./pages/admin/AdminDisplayAds";
import AdminTesting from "./pages/admin/AdminTesting";
import NotFound from "./pages/NotFound";
import Eula from "./pages/legal/Eula";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/select-organization" element={<SelectOrganization />} />

          {/* Legal pages (hidden — not linked from UI, noindex via meta) */}
          <Route path="/legal/eula" element={<Eula />} />
          <Route path="/legal/privacy" element={<PrivacyPolicy />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/tasks" replace />} />
            <Route path="tasks" element={<AdminTasks />} />
            <Route path="calendar" element={<AdminCalendar />} />
            <Route path="assignments" element={<AdminAssignments />} />
            <Route path="direct-publish" element={<AdminDirectPublish />} />
            <Route path="direct-blast" element={<AdminDirectBlast />} />
            <Route path="display-ads" element={<AdminDisplayAds />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="users" element={<AdminUserActivity />} />
            <Route path="activity" element={<AdminActivity />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="testing" element={<AdminTesting />} />
            {/* Redirects for old routes */}
            <Route path="requests" element={<Navigate to="/admin/tasks" replace />} />
            <Route path="orphaned-posts" element={<Navigate to="/admin/activity" replace />} />
            <Route path="logs" element={<Navigate to="/admin/activity" replace />} />
          </Route>
          
          {/* Client Routes */}
          <Route path="/client" element={<ClientLayout />}>
            <Route index element={<Navigate to="/client/posts" replace />} />
            <Route path="posts" element={<ClientPosts />} />
            <Route path="submit" element={<ClientSubmitPost />} />
            <Route path="edit" element={<ClientEditPost />} />
            <Route path="drafts" element={<ClientDrafts />} />
            <Route path="email-marketing" element={<ClientEmailBlasts />} />
            {/* Redirect old route */}
            <Route path="email-blasts" element={<Navigate to="/client/email-marketing" replace />} />
            <Route path="submit-blast" element={<ClientSubmitBlast />} />
            <Route path="submit-sponsorship" element={<ClientSubmitSponsorship />} />
            <Route path="display-ads" element={<ClientDisplayAds />} />
            <Route path="settings" element={<ClientSettings />} />
            <Route path="guide" element={<ClientGuide />} />
          </Route>

          {/* Sales (CRM) Routes */}
          <Route path="/sales" element={<SalesLayout />}>
            <Route index element={<Navigate to="/sales/pipeline" replace />} />
            <Route path="pipeline" element={<SalesPipeline />} />
            <Route path="deals" element={<SalesDeals />} />
            <Route path="organizations" element={<SalesOrganizations />} />
            <Route path="contacts" element={<SalesContacts />} />
            <Route path="products" element={<SalesProducts />} />
            <Route path="activities" element={<SalesActivities />} />
            <Route path="settings" element={<SalesSettings />} />
            <Route path="testing" element={<SalesTesting />} />
            <Route path="assignment-defaults" element={<SalesAssignmentDefaults />} />
            <Route path="products/:productId/bundle" element={<SalesBundleComposition />} />
          </Route>
          
          {/* Root redirect based on role */}
          <Route path="/" element={<RoleBasedRedirect />} />
          
          {/* Catch all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
