import React from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Route guard that checks if user has one of the allowed account types.
 * 
 * Usage:
 * <RequireAccountType types={['affiliate', 'both']}>
 *   <AffiliateDashboardPage />
 * </RequireAccountType>
 * 
 * @param {Object} props
 * @param {string[]} props.types - Allowed account types: 'business', 'affiliate', 'both'
 * @param {string} [props.redirectTo] - Where to redirect if not allowed (default: based on account type)
 * @param {React.ReactNode} props.children - Protected content
 */
export default function RequireAccountType({ types = [], redirectTo, children }) {
  const [checking, setChecking] = React.useState(true);
  const [isAllowed, setIsAllowed] = React.useState(false);
  const [redirectPath, setRedirectPath] = React.useState("/dashboard");

  React.useEffect(() => {
    let mounted = true;
    
    const checkAccountType = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        
        if (!user) {
          if (mounted) {
            setIsAllowed(false);
            setRedirectPath("/login");
            setChecking(false);
          }
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("account_type, role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error || !profile) {
          if (mounted) {
            setIsAllowed(false);
            setRedirectPath("/login");
            setChecking(false);
          }
          return;
        }

        // Admins can access any route
        if (profile.role === "admin") {
          if (mounted) {
            setIsAllowed(true);
            setChecking(false);
          }
          return;
        }

        // Check if user's account_type is in allowed types
        const accountType = profile.account_type || "business";
        const allowed = types.includes(accountType);

        if (mounted) {
          setIsAllowed(allowed);
          
          // Determine redirect path based on account type if not allowed
          if (!allowed) {
            if (redirectTo) {
              setRedirectPath(redirectTo);
            } else if (accountType === "affiliate") {
              setRedirectPath("/affiliate/dashboard");
            } else {
              setRedirectPath("/dashboard");
            }
          }
          
          setChecking(false);
        }
      } catch (err) {
        console.error("[RequireAccountType] Error:", err);
        if (mounted) {
          setIsAllowed(false);
          setRedirectPath("/login");
          setChecking(false);
        }
      }
    };

    checkAccountType();
    
    return () => {
      mounted = false;
    };
  }, [types, redirectTo]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#05070d",
          color: "#10b981",
          letterSpacing: "0.2rem",
          fontFamily: "monospace",
        }}
      >
        VERIFYING ACCESS...
      </div>
    );
  }

  if (!isAllowed) {
    return <Navigate to={redirectPath} replace />;
  }

  return children;
}
