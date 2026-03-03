import { useState } from 'react';
import { Calendar, Clock, Users, MapPin, Star, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import SignupCounter from '@/components/SignupCounter';
import SEOHead, { combinedHomeStructuredData } from '@/components/SEOHead';
import StateSelectionDialog from '@/components/StateSelectionDialog';
import golfHeroImage from '@/assets/golf-hero.jpg';

const Home = () => {
  const [showStateDialog, setShowStateDialog] = useState(false);
  return (
    <div className="min-h-screen">
      <SEOHead 
        title="Holezy Golf | Book Tee Times in Boston, NYC & Chicago"
        description="Book premium tee times in Boston, New York City, and Chicago using AI-powered availability tracking. Secure prime weekend rounds with Holezy Golf."
        canonicalUrl="/"
        structuredData={combinedHomeStructuredData}
      />
      {/* Hero Section */}
      <section className="relative text-white py-20 px-4 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${golfHeroImage})` }}
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative max-w-4xl mx-auto text-center z-10">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Tee Times Made Simple
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Tell us when and where you want to play, and we'll do the booking for you.
          </p>
          <Button 
            size="lg" 
            className="text-lg px-8 py-6 bg-white text-primary hover:bg-gray-100"
            onClick={() => setShowStateDialog(true)}
          >
            Book My Tee Time
          </Button>
        </div>
      </section>

      {/* What Holezy Golf Does - SEO Content */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
            Your AI-Powered Golf Tee Time Concierge
          </h2>
          <div className="space-y-4 text-lg text-muted-foreground leading-relaxed">
            <p>
              Holezy Golf is an AI-powered tee time concierge service designed for weekend golfers who are tired of the frustration that comes with booking prime tee times. Whether you're trying to <strong>book golf tee times in Boston</strong>, secure a Saturday morning slot at a popular <strong>Chicago golf course</strong>, or find availability at <strong>NYC public golf</strong> courses, Holezy Golf takes the hassle out of the process entirely.
            </p>
            <p>
              Our technology continuously monitors tee time availability across thousands of golf courses, identifying open slots the moment they become available. Instead of setting alarms, refreshing booking websites, or calling pro shops during business hours, you simply tell us when and where you want to play. We handle the rest — from finding availability to securing your booking and sending you a confirmation with all the details.
            </p>
            <p>
              The challenge of booking golf tee times is most acute in major metropolitan areas where demand far exceeds supply. In Boston, courses like George Wright and Granite Links can fill their weekend tee sheets within minutes. In New York City, municipal courses serving over 8 million residents see extraordinary competition for peak-hour slots. And in Chicago, the compressed Midwest golf season means that every warm-weather weekend produces intense demand at forest preserve and park district courses.
            </p>
            <p>
              Holezy Golf was built specifically for these high-demand markets. Our AI doesn't just check availability once — it monitors courses continuously, tracking cancellations, newly released time slots, and booking patterns to give you the best possible chance of playing when and where you want. At just $5 per player, it's a fraction of the cost of the time you'd spend trying to <strong>reserve tee times online</strong> by yourself.
            </p>
            <p>
              Whether you're a casual weekend golfer, planning a group outing, or organizing a trip to one of America's great golf cities, Holezy Golf is the simplest way to get on the course. Explore our top golf destinations: <Link to="/golf-courses/massachusetts/boston" className="text-primary hover:underline font-medium">Boston golf courses</Link>, <Link to="/golf-courses/new-york/new-york-city" className="text-primary hover:underline font-medium">NYC public golf courses</Link>, and <Link to="/golf-courses/illinois/chicago" className="text-primary hover:underline font-medium">Chicago tee times</Link>.
            </p>
          </div>
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

      {/* Social Proof Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Trusted by Golfers Everywhere
            </h2>
            <p className="text-xl text-muted-foreground">
              Join thousands of satisfied golfers who've simplified their booking experience
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <SignupCounter />
            
            <Card className="text-center golf-card-shadow">
              <CardContent className="p-6">
                <div className="flex justify-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-500 fill-current" />
                  ))}
                </div>
                <div className="text-3xl font-bold text-primary mb-2">4.9/5</div>
                <p className="text-muted-foreground font-medium">
                  Average Customer Rating
                </p>
              </CardContent>
            </Card>

            <Card className="text-center golf-card-shadow">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <div className="text-3xl font-bold text-primary mb-2">2.3min</div>
                <p className="text-muted-foreground font-medium">
                  Average Booking Time
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Testimonials */}
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="golf-card-shadow">
              <CardContent className="p-6">
                <Quote className="w-8 h-8 text-primary mb-4" />
                <p className="text-lg mb-4 italic">
                  "Holezy Golf saved me so much time! No more calling around to different courses. 
                  I just tell them when I want to play and they handle everything."
                </p>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                    <span className="text-primary font-semibold">MJ</span>
                  </div>
                  <div>
                    <p className="font-semibold">Mike Johnson</p>
                    <p className="text-sm text-muted-foreground">Weekend Golfer</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="golf-card-shadow">
              <CardContent className="p-6">
                <Quote className="w-8 h-8 text-primary mb-4" />
                <p className="text-lg mb-4 italic">
                  "Booking tee times with friends is usually a challenge, but this service made it effortless. We planned weeks ahead and enjoyed a stress-free day on the course together."
                </p>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                    <span className="text-primary font-semibold">SL</span>
                  </div>
                  <div>
                    <p className="font-semibold">Sarah Lee</p>
                    <p className="text-sm text-muted-foreground">Golf Enthusiast</p>
                  </div>
                </div>
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
              <Button 
                size="lg" 
                className="text-lg px-8 py-6 mt-8"
                onClick={() => setShowStateDialog(true)}
              >
                Let's Get Playing
              </Button>
            </div>
            <div className="bg-muted/30 rounded-lg p-8">
              <div className="text-center">
                <Users className="w-16 h-16 text-primary mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-4">Perfect for Weekend Golfers</h3>
                <p className="text-muted-foreground text-lg">
                  Designed for casual golfers who want stress-free tee times, whether it’s a weekend round or that trip you’ve been planning.
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
          <Button 
            size="lg" 
            className="text-lg px-8 py-6 bg-white text-primary hover:bg-gray-100"
            onClick={() => setShowStateDialog(true)}
          >
            Secure My Spot
          </Button>
        </div>
      </section>

      <StateSelectionDialog 
        isOpen={showStateDialog} 
        onClose={() => setShowStateDialog(false)} 
      />
    </div>
  );
};

export default Home;