import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const AdminSetup = () => {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const setupAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setStatus("error");
        setMessage("You must be logged in to set up admin access.");
        return;
      }

      // Check if user already has admin role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (existingRole) {
        setStatus("already");
        setMessage("You already have admin access!");
        return;
      }

      // Add admin role
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, role: "admin" });

      if (error) {
        setStatus("error");
        setMessage(`Failed to grant admin access: ${error.message}`);
      } else {
        setStatus("success");
        setMessage("Admin access granted successfully!");
      }
    };

    setupAdmin();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-center">Admin Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-4">
            {status === "loading" && (
              <>
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-center text-muted-foreground">Setting up admin access...</p>
              </>
            )}
            
            {status === "success" && (
              <>
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-center font-semibold text-green-700">{message}</p>
                <Button onClick={() => navigate("/blog")} className="w-full">
                  Go to Blog
                </Button>
              </>
            )}
            
            {status === "already" && (
              <>
                <CheckCircle className="w-12 h-12 text-blue-500" />
                <p className="text-center font-semibold text-blue-700">{message}</p>
                <Button onClick={() => navigate("/blog")} className="w-full">
                  Go to Blog
                </Button>
              </>
            )}
            
            {status === "error" && (
              <>
                <XCircle className="w-12 h-12 text-red-500" />
                <p className="text-center font-semibold text-red-700">{message}</p>
                <Button onClick={() => navigate("/")} variant="outline" className="w-full">
                  Go Home
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSetup;
