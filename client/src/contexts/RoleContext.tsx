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
  
  // Use server admin status as source of truth (database-driven)
  const isAdmin = serverIsAdmin && !!user; // Only show admin if authenticated
  const role: UserRole = isAdmin ? 'admin' : 'user';

  // Removed setRole functionality - roles are now database-managed by admins only
  const setRole = async (newRole: UserRole) => {
    console.warn('Role changes are now managed by administrators only');
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