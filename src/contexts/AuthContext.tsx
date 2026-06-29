import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

type UserRole = 'admin' | 'client' | 'super_admin' | 'sales' | null;

interface UserOrganization {
  id: string;
  organization_id: string;
  organization_name: string;
  is_primary: boolean;
}

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  userOrganizations: UserOrganization[];
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: 'admin' | 'client') => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (requiredRole: 'admin' | 'client') => boolean;
  resetPasswordRequest: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  setActiveOrganization: (orgId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_ORG_KEY = 'active_organization_id';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [activeOrganizationName, setActiveOrganizationName] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const navigate = useNavigate();
  
  // Track if we've completed initial session setup to prevent reloads on tab focus
  const isInitialized = useRef(false);
  const currentUserId = useRef<string | null>(null);

  const fetchUserRole = async (userId: string): Promise<UserRole> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      console.error('Error fetching user role:', error);
      return null;
    }

    return data.role as UserRole;
  };

  const fetchUserOrganizations = async (userId: string): Promise<UserOrganization[]> => {
    const { data, error } = await supabase
      .from('user_organizations')
      .select(`
        id,
        organization_id,
        is_primary,
        organizations (name)
      `)
      .eq('user_id', userId);

    if (error || !data) {
      console.error('Error fetching user organizations:', error);
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      organization_id: item.organization_id,
      organization_name: item.organizations?.name || 'Unknown',
      is_primary: item.is_primary,
    }));
  };

  const initializeActiveOrganization = (orgs: UserOrganization[]) => {
    if (orgs.length === 0) {
      setActiveOrganizationId(null);
      setActiveOrganizationName(null);
      return;
    }

    // Check localStorage for previously selected org
    const storedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
    const storedOrg = orgs.find(o => o.organization_id === storedOrgId);
    
    if (storedOrg) {
      setActiveOrganizationId(storedOrg.organization_id);
      setActiveOrganizationName(storedOrg.organization_name);
      return;
    }

    // If only one org, auto-select it
    if (orgs.length === 1) {
      setActiveOrganizationId(orgs[0].organization_id);
      setActiveOrganizationName(orgs[0].organization_name);
      localStorage.setItem(ACTIVE_ORG_KEY, orgs[0].organization_id);
      return;
    }

    // Multiple orgs but none selected - will be handled by routing
    const primaryOrg = orgs.find(o => o.is_primary);
    if (primaryOrg) {
      setActiveOrganizationId(primaryOrg.organization_id);
      setActiveOrganizationName(primaryOrg.organization_name);
      localStorage.setItem(ACTIVE_ORG_KEY, primaryOrg.organization_id);
    }
  };

  const setActiveOrganization = (orgId: string) => {
    const org = userOrganizations.find(o => o.organization_id === orgId);
    if (org) {
      setActiveOrganizationId(orgId);
      setActiveOrganizationName(org.organization_name);
      localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    }
  };

  useEffect(() => {
    // Listen for auth changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Handle token refresh silently - just update user without loading state
      if (event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null);
        return;
      }

      // Update last_login timestamp on actual sign-in
      if (event === 'SIGNED_IN' && session?.user) {
        supabase
          .from('profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('id', session.user.id)
          .then(({ error }) => {
            if (error) console.error('Failed to update last login:', error);
          });
      }

      // If already initialized and the user ID hasn't changed, don't reload anything
      // This prevents the page from reloading when switching tabs
      if (isInitialized.current && session?.user?.id === currentUserId.current) {
        return;
      }

      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Only show loading for first sign-in, not subsequent events
        if (!isInitialized.current) {
          setLoading(true);
        }
        
        // Defer the role fetch to prevent deadlock
        setTimeout(async () => {
          const userRole = await fetchUserRole(session.user.id);
          setRole(userRole);
          
          // Fetch organizations for clients
          if (userRole === 'client') {
            const orgs = await fetchUserOrganizations(session.user.id);
            setUserOrganizations(orgs);
            initializeActiveOrganization(orgs);
          }
          
          currentUserId.current = session.user.id;
          isInitialized.current = true;
          setLoading(false);
          
          // If user has no role, sign them out
          if (userRole === null) {
            console.error('User has no role assigned');
            supabase.auth.signOut();
          }
        }, 0);
      } else {
        // User signed out - reset initialization state
        currentUserId.current = null;
        isInitialized.current = false;
        setRole(null);
        setUserOrganizations([]);
        setActiveOrganizationId(null);
        setActiveOrganizationName(null);
        localStorage.removeItem(ACTIVE_ORG_KEY);
        setLoading(false);
      }
    });

    // getSession is only needed to trigger the initial onAuthStateChange event
    // Do NOT duplicate role/org fetching here - onAuthStateChange handles it
    supabase.auth.getSession();

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string, role: 'admin' | 'client') => {
    // Sign up the user - role assignment is handled server-side
    // via the create-user edge function or database trigger
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          requested_role: role,
        },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('Failed to create user');
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    localStorage.removeItem(ACTIVE_ORG_KEY);
    navigate('/auth');
  };

  const isSuperAdmin = role === 'super_admin';

  const hasRole = (requiredRole: 'admin' | 'client'): boolean => {
    if (requiredRole === 'admin') {
      return role === 'admin' || role === 'super_admin';
    }
    return role === requiredRole;
  };

  const resetPasswordRequest = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    if (error) throw error;
  };

  const resetPassword = async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    if (error) {
      console.error('Password reset error details:', {
        message: error.message,
        status: error.status,
        name: error.name,
        code: (error as any).code,
        details: error
      });
      throw error;
    }
    
    console.log('Password reset successful:', { userId: data?.user?.id });
  };

  const signInWithOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      }
    });
    if (error) throw error;
  };

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      role, 
      loading, 
      activeOrganizationId,
      activeOrganizationName,
      userOrganizations,
      isSuperAdmin,
      signIn, 
      signUp, 
      signOut, 
      hasRole, 
      resetPasswordRequest, 
      resetPassword, 
      signInWithOtp, 
      verifyOtp,
      setActiveOrganization
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
