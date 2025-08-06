import { Link } from 'react-router-dom';
import { Calendar, Clock, Users, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import golfHeroImage from '@/assets/golf-hero.jpg';

const Home = () => {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative text-white py-20 px-4 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${golfHeroImage})` }}
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative max-w-4xl mx-auto text-center z-10">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Golf Made Simple
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Tell us when and where you want to play, and we'll do the booking for you.
          </p>
          <Link to="/book">
            <Button size="lg" className="text-lg px-8 py-6 bg-white text-primary hover:bg-gray-100">
              Book My Tee Time
            </Button>
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center golf-card-shadow">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">1. Tell Us When</h3>
                <p className="text-muted-foreground">
                  Pick your preferred date and time range. We'll find the best available slots.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center golf-card-shadow">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">2. Choose Your Course</h3>
                <p className="text-muted-foreground">
                  Select from thousands of golf courses. We'll handle the booking details.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center golf-card-shadow">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">3. We Book It</h3>
                <p className="text-muted-foreground">
                  Sit back and relax. We'll secure your tee time and send you confirmation.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Skip the Hassle
              </h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <p className="text-lg">No more calling courses during business hours</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <p className="text-lg">No more searching through multiple websites</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <p className="text-lg">Just $5 per player for our concierge service</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <p className="text-lg">Confirmation email with all details</p>
                </div>
              </div>
              <Link to="/book" className="inline-block mt-8">
                <Button size="lg" className="text-lg px-8 py-6">
                  Let's Get Playing
                </Button>
              </Link>
            </div>
            <div className="bg-muted/30 rounded-lg p-8">
              <div className="text-center">
                <Users className="w-16 h-16 text-primary mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-4">Perfect for Weekend Golfers</h3>
                <p className="text-muted-foreground text-lg">
                  Designed for casual golfers who want more time on the course and less time 
                  dealing with booking logistics. 
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Book Your Next Round?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Join thousands of golfers who've simplified their booking experience.
          </p>
          <Link to="/book">
            <Button size="lg" className="text-lg px-8 py-6 bg-white text-primary hover:bg-gray-100">
              Secure My Spot
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;