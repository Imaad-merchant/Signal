import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth } from '@/api/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    let resolved = false;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      resolved = true;
      if (firebaseUser) {
        setUser({
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          uid: firebaseUser.uid,
          photoURL: firebaseUser.photoURL,
        });
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
    }, (error) => {
      // Auth error — stop loading and show login
      console.error('Auth error:', error);
      resolved = true;
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
    });

    // Safety timeout — if auth doesn't resolve in 5 seconds, stop loading
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('Auth timeout — showing login');
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const logout = (shouldRedirect = true) => {
    auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {};

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      logout,
      navigateToLogin,
      checkAppState: () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
