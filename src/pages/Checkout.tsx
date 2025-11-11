import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, Users, MapPin, Tag, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { loadStripe, StripeCardElement } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { BookingData } from './BookingForm';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const CheckoutForm = ({ bookingData }: { bookingData: BookingData }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  
  const [promoCode, setPromoCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');

  const calculateTotal = () => {
    return bookingData.numberOfPlayers * 5; // $5 per player
  };

  useEffect(() => {
    // Create PaymentIntent on component mount
    const createPaymentIntent = async () => {
      try {
        console.log('Creating payment intent...', {
          amount: calculateTotal(),
          email: bookingData.email,
          name: `${bookingData.firstName} ${bookingData.lastName}`
        });

        const { data, error } = await supabase.functions.invoke('create-payment-intent', {
          body: {
            amount: calculateTotal(),
            email: bookingData.email,
            name: `${bookingData.firstName} ${bookingData.lastName}`
          }
        });

        console.log('Payment intent response:', { data, error });

        if (error) {
          console.error('Payment intent error:', error);
          throw error;
        }

        if (!data) {
          throw new Error('No data returned from payment intent creation');
        }

        console.log('Payment intent created successfully:', data);
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId);
        setCustomerId(data.customerId);
      } catch (error: any) {
        console.error('Error creating payment intent:', error);
        toast({
          title: "Payment Setup Failed",
          description: error.message || "Unable to initialize payment. Please refresh and try again.",
          variant: "destructive"
        });
      }
    };

    createPaymentIntent();
  }, [bookingData, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form submitted', { stripe: !!stripe, elements: !!elements, clientSecret: !!clientSecret });

    if (!stripe || !elements) {
      toast({
        title: "Payment Not Ready",
        description: "Payment system is still loading. Please wait a moment and try again.",
        variant: "destructive"
      });
      return;
    }

    if (!clientSecret) {
      toast({
        title: "Payment Not Initialized",
        description: "Payment setup failed. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    if (!termsAccepted) {
      toast({
        title: "Terms Required",
        description: "Please accept the terms and conditions to continue",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    console.log('Processing payment...');

    try {
      const cardElement = elements.getElement(CardElement) as StripeCardElement;
      if (!cardElement) throw new Error('Card element not found');

      // Confirm the payment (this authorizes the card)
      console.log('Confirming card payment with clientSecret:', clientSecret);
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${bookingData.firstName} ${bookingData.lastName}`,
              email: bookingData.email,
              phone: bookingData.phone,
            },
          },
        }
      );

      console.log('Payment confirmation result:', { 
        error: confirmError, 
        paymentIntent: paymentIntent ? {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount
        } : null 
      });

      if (confirmError) {
        console.error('Stripe confirmation error:', confirmError);
        throw new Error(confirmError.message);
      }

      if (!paymentIntent) {
        throw new Error('No payment intent returned from Stripe');
      }

      if (paymentIntent.status !== 'requires_capture') {
        console.error('Unexpected payment status:', paymentIntent.status);
        throw new Error(`Payment authorization failed. Status: ${paymentIntent.status}`);
      }

      console.log('Payment authorized successfully:', paymentIntent.id);

      // Get current user session (guests allowed)
      const { data: { session } } = await supabase.auth.getSession();
      let clientAccountId: number | null = null;
      
      if (session?.user) {
        // Try to find existing account
        const { data: clientAccount } = await supabase
          .from('Client_Accounts')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (clientAccount?.id) {
          clientAccountId = clientAccount.id;
        } else {
          // Create account for this user
          const { data: upserted } = await supabase
            .from('Client_Accounts')
            .upsert(
              {
                user_id: session.user.id,
                email: session.user.email,
                first_name: bookingData.firstName,
                last_name: bookingData.lastName,
                phone: bookingData.phone,
                stripe_customer_id: customerId
              },
              { onConflict: 'user_id' }
            )
            .select('id')
            .single();

          if (upserted?.id) {
            clientAccountId = upserted.id;
          }
        }
      }

      // Update client account with Stripe customer ID
      if (clientAccountId) {
        await supabase
          .from('Client_Accounts')
          .update({ 
            stripe_customer_id: customerId,
            default_payment_method_id: paymentIntent.payment_method as string
          })
          .eq('id', clientAccountId);
      }

      // Convert time to proper format for database
      const convertTo24Hour = (time12h: string) => {
        const [time, modifier] = time12h.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') {
          hours = '00';
        }
        if (modifier === 'PM') {
          hours = (parseInt(hours, 10) + 12).toString();
        }
        return `${hours.padStart(2, '0')}:${minutes}:00`;
      };

      // Fetch course details
      let facilityId = null;
      let hasOnlineBooking = null;
      
      if (bookingData.preferredCourse) {
        try {
          const { data: courseData } = await (supabase as any)
            .from('Course_Database')
            .select('"Facility ID", "Tee Time Booking"')
            .eq('"Course Name"', bookingData.preferredCourse)
            .maybeSingle();
        
          if (courseData) {
            facilityId = courseData["Facility ID"];
            hasOnlineBooking = courseData["Tee Time Booking"];
          }
        } catch (error) {
          console.log('Error fetching course data:', error);
        }
      }

      // Save booking to database
      const bookingRecord = {
        client_id: clientAccountId,
        user_id: session?.user?.id || null,
        First: bookingData.firstName,
        Last: bookingData.lastName,
        email: bookingData.email,
        phone: bookingData.phone,
        booking_date: bookingData.date,
        earliest_time: convertTo24Hour(bookingData.earliestTime),
        latest_time: convertTo24Hour(bookingData.latestTime),
        number_of_players: bookingData.numberOfPlayers,
        preferred_course: bookingData.preferredCourse,
        facility_id: facilityId,
        has_online_booking: hasOnlineBooking,
        booking_status: 'pending',
        total_price: calculateTotal(),
        promo_code: promoCode || null,
        payment_status: 'authorized',
        stripe_payment_method_id: paymentIntent.payment_method as string,
        stripe_payment_intent_id: paymentIntent.id,
        amount_charged: calculateTotal(),
        currency: 'usd'
      };

      const { error: dbError } = await supabase
        .from('Client_Bookings')
        .insert([bookingRecord]);

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save booking');
      }

      // Store confirmation data
      const confirmationData = {
        ...bookingData,
        totalPrice: calculateTotal(),
        promoCode,
        paymentMethod: {
          last4: (paymentIntent.payment_method as any)?.card?.last4 || '****',
          cardType: 'Credit Card'
        }
      };
      
      sessionStorage.setItem('confirmationData', JSON.stringify(confirmationData));
      
      // Send emails
      try {
        await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            ...confirmationData,
            type: 'booking_confirmation',
            firstName: bookingData.firstName,
            lastName: bookingData.lastName,
            email: bookingData.email
          }
        });

        await supabase.functions.invoke('send-admin-alert', {
          body: {
            type: 'booking_made',
            userEmail: bookingData.email,
            userName: `${bookingData.firstName} ${bookingData.lastName}`,
            bookingDetails: {
              id: paymentIntent.id,
              course: bookingData.preferredCourse,
              date: bookingData.date,
              players: bookingData.numberOfPlayers,
              totalPrice: calculateTotal()
            }
          }
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
      }

      sessionStorage.removeItem('bookingData');
      
      toast({
        title: "Payment Authorized!",
        description: "Your card has been authorized. We'll charge it once your tee time is confirmed."
      });

      navigate('/confirmation');
    } catch (error: any) {
      console.error('Booking error:', error);
      toast({
        title: "Payment Failed",
        description: error.message || "There was an error processing your payment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Secure Your Tee Time</h1>
          <p className="text-lg text-muted-foreground">
            Review your booking details and authorize payment
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Booking Summary */}
          <Card className="golf-card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-primary" />
                <span>Booking Summary</span>
              </CardTitle>
              <CardDescription>Review your tee time request details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Golfer:</span>
                  <span className="font-medium">{bookingData.firstName} {bookingData.lastName}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{bookingData.email}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-medium">{bookingData.phone}</span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <Calendar className="w-4 h-4" />
                    <span>Date:</span>
                  </span>
                  <span className="font-medium">
                    {new Date(bookingData.date).toLocaleDateString('en-US', {
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
                  <span className="font-medium">{bookingData.earliestTime} - {bookingData.latestTime}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>Players:</span>
                  </span>
                  <span className="font-medium">{bookingData.numberOfPlayers}</span>
                </div>
                
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground flex items-center space-x-1">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Course:</span>
                  </span>
                  <span className="font-medium text-right">{bookingData.preferredCourse}</span>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Concierge Fee ({bookingData.numberOfPlayers} × $5):</span>
                    <span>${calculateTotal()}.00</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>${calculateTotal()}.00</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          <Card className="golf-card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-primary" />
                <span>Payment Authorization</span>
              </CardTitle>
              <CardDescription>
                Your card will be authorized but not charged until your tee time is confirmed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Card Details *</Label>
                    <div className="p-3 border rounded-md">
                      <CardElement
                        options={{
                          style: {
                            base: {
                              fontSize: '16px',
                              color: 'hsl(var(--foreground))',
                              '::placeholder': {
                                color: 'hsl(var(--muted-foreground))',
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="promoCode" className="flex items-center space-x-1">
                      <Tag className="w-4 h-4" />
                      <span>Promo Code (Optional)</span>
                    </Label>
                    <Input
                      id="promoCode"
                      type="text"
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                    />
                  </div>

                  <div className="flex items-start space-x-2 pt-4">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                    />
                    <Label 
                      htmlFor="terms" 
                      className="text-sm leading-relaxed cursor-pointer"
                    >
                      I agree to the terms and conditions, including the cancellation policy. 
                      I understand my card will be authorized now and charged only when my 
                      tee time is confirmed.
                    </Label>
                  </div>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium mb-1">Secure Payment Authorization</p>
                    <p className="text-muted-foreground">
                      Your payment information is encrypted and secure. We'll authorize your 
                      card for ${calculateTotal()}.00 and charge it only after we confirm your 
                      tee time booking.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={!stripe || !clientSecret || isProcessing}
                >
                  {isProcessing 
                    ? "Authorizing..." 
                    : !clientSecret 
                    ? "Loading..." 
                    : `Authorize Payment - $${calculateTotal()}.00`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const Checkout = () => {
  const navigate = useNavigate();
  const [bookingData, setBookingData] = useState<BookingData | null>(null);

  useEffect(() => {
    const storedData = sessionStorage.getItem('bookingData');
    if (storedData) {
      setBookingData(JSON.parse(storedData));
    } else {
      navigate('/book');
    }
  }, [navigate]);

  if (!bookingData) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Loading booking details...</p>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm bookingData={bookingData} />
    </Elements>
  );
};

export default Checkout;
