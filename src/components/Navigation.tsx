import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Navigation = () => {
  const [user, setUser] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

const handleSignOut = async () => {
  try {
    await supabase.auth.signOut();
    toast({
      title: "Signed out successfully",
      description: "See you on the course!"
    });
    navigate('/');
  } catch (error) {
    toast({
      title: "Error signing out",
      description: "Please try again",
      variant: "destructive"
    });
  }
};

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-card border-b sticky top-0 z-50 golf-card-shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">⛳</span>
            </div>
            <span className="font-bold text-xl text-foreground">GolfBooker</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className={`font-medium transition-colors ${
                isActive('/') 
                  ? 'text-primary border-b-2 border-primary pb-1' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Home
            </Link>
            <Link
              to="/book"
              className={`font-medium transition-colors ${
                isActive('/book') 
                  ? 'text-primary border-b-2 border-primary pb-1' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Book a Tee Time
            </Link>
            <Link
              to="/faq"
              className={`font-medium transition-colors ${
                isActive('/faq') 
                  ? 'text-primary border-b-2 border-primary pb-1' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              FAQ
            </Link>
            <Link
              to="/contact"
              className={`font-medium transition-colors ${
                isActive('/contact') 
                  ? 'text-primary border-b-2 border-primary pb-1' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Contact
            </Link>
            {user ? (
              <div className="flex items-center space-x-4">
                <Link to="/profile" aria-label="Profile">
                  <Button variant="ghost" size="icon">
                    <User className="w-5 h-5" />
                    <span className="sr-only">Profile</span>
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="flex items-center space-x-1"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </Button>
              </div>
            ) : (
              <Link to="/auth">
                <Button className="flex items-center space-x-1">
                  <User className="w-4 h-4" />
                  <span>Login</span>
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden pb-4 pt-2 space-y-3">
            <Link
              to="/"
              className={`block font-medium transition-colors ${
                isActive('/') ? 'text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              to="/book"
              className={`block font-medium transition-colors ${
                isActive('/book') ? 'text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Book a Tee Time
            </Link>
            <Link
              to="/faq"
              className={`block font-medium transition-colors ${
                isActive('/faq') ? 'text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              FAQ
            </Link>
            <Link
              to="/contact"
              className={`block font-medium transition-colors ${
                isActive('/contact') ? 'text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Contact
            </Link>
            {user ? (
              <>
                <Link
                  to="/profile"
                  className={`block font-medium transition-colors ${
                    isActive('/profile') ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Profile
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleSignOut();
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center space-x-1 w-full justify-start"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </Button>
              </>
            ) : (
              <Link
                to="/auth"
                onClick={() => setIsMenuOpen(false)}
                className="block"
              >
                <Button className="flex items-center space-x-1 w-full justify-start">
                  <User className="w-4 h-4" />
                  <span>Login</span>
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;