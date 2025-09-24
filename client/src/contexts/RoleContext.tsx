import { createContext, useContext, useState, useEffect } from "react";

type UserRole = 'user' | 'admin';

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isAdmin: boolean;
  isUser: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>(() => {
    // Get role from localStorage or default to 'user'
    const savedRole = localStorage.getItem('gala8ball_user_role');
    return (savedRole === 'admin' || savedRole === 'user') ? savedRole : 'user';
  });

  // Save role to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('gala8ball_user_role', role);
  }, [role]);

  const value = {
    role,
    setRole,
    isAdmin: role === 'admin',
    isUser: role === 'user'
  };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}