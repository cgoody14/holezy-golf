import { Facebook, Instagram, Linkedin } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-muted/30 py-8 px-4 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-6">
            <a 
              href="https://instagram.com/golfbooker" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors duration-200"
              aria-label="Follow us on Instagram"
            >
              <Instagram className="w-6 h-6" />
            </a>
            <a 
              href="https://facebook.com/golfbooker" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors duration-200"
              aria-label="Follow us on Facebook"
            >
              <Facebook className="w-6 h-6" />
            </a>
            <a 
              href="https://linkedin.com/company/golfbooker" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors duration-200"
              aria-label="Connect with us on LinkedIn"
            >
              <Linkedin className="w-6 h-6" />
            </a>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Holezy Golf. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;