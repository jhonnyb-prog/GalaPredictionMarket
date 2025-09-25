import { createContext, useContext, useState } from "react";
import { useUser } from "./UserContext";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

type UserRole = 'user' | 'admin';

interface RoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isAdmin: boolean;
  isUser: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin: serverIsAdmin, user } = useUser();
  const queryClient = useQueryClient();
  
  // Use server admin status as source of truth
  const isAdmin = serverIsAdmin && !!user; // Only show admin if authenticated
  const role: UserRole = isAdmin ? 'admin' : 'user';

  const setRole = async (newRole: UserRole) => {
    if (!user) return; // Can't change role if not logged in
    
    try {
      const isAdminRole = newRole === 'admin';
      
      // Update role on server
      await apiRequest('POST', '/api/auth/role', {
        isAdmin: isAdminRole
      });
      
      // Refetch user data to update admin status
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const value = {
    role,
    setRole,
    isAdmin,
    isUser: !isAdmin
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