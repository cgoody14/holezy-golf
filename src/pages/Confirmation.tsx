import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Calendar, Clock, Users, MapPin, CreditCard, Mail, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ConfirmationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  date: string;
  earliestTime: string;
  latestTime: string;
  numberOfPlayers: number;
  preferredCourse: string;
  totalPrice: number;
  promoCode?: string;
  paymentMethod: {
    last4: string;
    cardType: string;
  };
}

const Confirmation = () => {
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);
  const [courseAddress, setCourseAddress] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    // Get confirmation data from session storage
    const storedData = sessionStorage.getItem('confirmationData');
    if (storedData) {
      const data = JSON.parse(storedData);
      setConfirmationData(data);
      
      // Fetch course address
      const fetchCourseAddress = async () => {
        try {
          const { data: courseData, error } = await supabase
            .from('Course_Database')
            .select('address')
            .eq('course_name', data.preferredCourse)
            .single();
          
          if (!error && courseData?.address) {
            setCourseAddress(courseData.address);
          }
        } catch (error) {
          console.log('Course address not found');
        }
      };
      
      fetchCourseAddress();
    } else {
      // Redirect to home if no confirmation data
      navigate('/');
    }
  }, [navigate]);

  if (!confirmationData) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Loading confirmation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-green-600">
            Booking Request Submitted!
          </h1>
          <p className="text-lg text-muted-foreground">
            We've received your tee time request and will confirm availability shortly.
          </p>
        </div>

        {/* Confirmation Details */}
        <Card className="golf-card-shadow mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span>Booking Confirmation</span>
            </CardTitle>
            <CardDescription>
              Here are the details of your tee time request
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Golfer Information */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Golfer Information</h3>
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{confirmationData.firstName} {confirmationData.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{confirmationData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-medium">{confirmationData.phone}</span>
                </div>
              </div>
            </div>

            {/* Tee Time Details */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Tee Time Details</h3>
              <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <Calendar className="w-4 h-4" />
                    <span>Date:</span>
                  </span>
                  <span className="font-medium">
                    {new Date(confirmationData.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>Time Range:</span>
                  </span>
                  <span className="font-medium">{confirmationData.earliestTime} - {confirmationData.latestTime}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>Players:</span>
                  </span>
                  <span className="font-medium">{confirmationData.numberOfPlayers}</span>
                </div>
                
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Course:</span>
                  </span>
                  <div className="text-right flex-1">
                    <div className="font-medium">{confirmationData.preferredCourse}</div>
                    {courseAddress && (
                      <div className="text-sm text-muted-foreground/70 mt-1">{courseAddress}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Payment Summary</h3>
              
              <div className="bg-muted/50 rounded-lg p-4 border border-border mb-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <span>Important Cancellation Notice</span>
                </h4>
                <p className="text-sm text-muted-foreground">
                  <strong>To cancel your tee time:</strong> If we have booked your tee time and you have received a confirmation, you must call the golf course directly to cancel. 
                  Our service only handles the initial booking request. The course manages all 
                  cancellations according to their policy.
                </p>
              </div>
              
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <span>Concierge Fee ({confirmationData.numberOfPlayers} × $5):</span>
                  <span>${confirmationData.totalPrice}.00</span>
                </div>
                {confirmationData.promoCode && (
                  <div className="flex justify-between text-green-600">
                    <span>Promo Code ({confirmationData.promoCode}):</span>
                    <span>Applied</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total:</span>
                  <span>${confirmationData.totalPrice}.00</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <CreditCard className="w-4 h-4" />
                    <span>Payment Method:</span>
                  </span>
                  <span className="font-medium">
                    {confirmationData.paymentMethod.cardType} ending in {confirmationData.paymentMethod.last4}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What's Next */}
        <Card className="golf-card-shadow mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Mail className="w-5 h-5 text-primary" />
              <span>What Happens Next?</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium">Confirmation Email Sent</p>
                  <p className="text-sm text-muted-foreground">
                    Check your email for a detailed confirmation of your booking request.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium">We'll Check Availability</p>
                  <p className="text-sm text-muted-foreground">
                    Our team will contact the golf course to secure your tee time.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">3</span>
                </div>
                <div>
                  <p className="font-medium">Final Confirmation</p>
                  <p className="text-sm text-muted-foreground">
                    You'll receive a final confirmation with your exact tee time and payment processing.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="text-center space-y-4">
          <Link to="/book">
            <Button size="lg" className="text-lg px-8 py-6">
              Book Another Tee Time
            </Button>
          </Link>
          
          <div>
            <Link to="/">
              <Button variant="outline" size="lg" className="text-lg px-8 py-6">
                Return to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;