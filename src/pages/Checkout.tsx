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

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  console.error('VITE_STRIPE_PUBLISHABLE_KEY is not set. The payment card field will not work.');
}
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

const CheckoutForm = ({ bookingData }: { bookingData: BookingData }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  
  const [promoCode, setPromoCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    name: string;
    percentOff: number | null;
    amountOff: number | null;
  } | null>(null);

  const calculateSubtotal = () => {
    return bookingData.numberOfPlayers * 5; // $5 per player
  };

  const calculateDiscount = () => {
    if (!appliedCoupon) return 0;
    const subtotal = calculateSubtotal();
    if (appliedCoupon.percentOff) {
      return (subtotal * appliedCoupon.percentOff) / 100;
    }
    if (appliedCoupon.amountOff) {
      return Math.min(appliedCoupon.amountOff, subtotal);
    }
    return 0;
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - calculateDiscount());
  };

  const handleApplyCoupon = async () => {
    if (!promoCode.trim()) return;
    
    setIsValidatingCoupon(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-coupon', {
        body: { promoCode: promoCode.trim(), email: bookingData.email }
      });

      if (error) throw error;

      if (data.valid) {
        setAppliedCoupon({
          name: data.name,
          percentOff: data.percentOff,
          amountOff: data.amountOff,
        });
        toast({
          title: "Promo Code Applied!",
          description: `${data.name} - ${data.percentOff ? `${data.percentOff}% off` : `$${data.amountOff} off`}`,
        });
      } else {
        toast({
          title: "Invalid Promo Code",
          description: data.error || "This promo code is not valid.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error validating coupon:', error);
      toast({
        title: "Error",
        description: "Unable to validate promo code. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setPromoCode('');
  };

  const fetchIntent = async () => {
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        amount: calculateTotal(),
        email: bookingData.email,
        name: `${bookingData.firstName} ${bookingData.lastName}`,
      }
    });
    if (error) throw error;
    if (!data) throw new Error('No data returned from payment intent creation');
    return {
      clientSecret: data.clientSecret as string,
      intentType: (data.type ?? 'payment') as 'payment' | 'setup',
      customerId: data.customerId as string,
      intentId: (data.paymentIntentId ?? data.setupIntentId ?? '') as string,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast({
        title: "Payment Not Ready",
        description: "Payment system is still loading. Please wait a moment and try again.",
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

    try {
      // Create the intent now — at submit time — so the amount includes any applied coupon
      const { clientSecret, intentType, customerId, intentId: _intentId } = await fetchIntent();

      const cardElement = elements.getElement(CardElement) as StripeCardElement;
      if (!cardElement) throw new Error('Card element not found');

      const billingDetails = {
        name: `${bookingData.firstName} ${bookingData.lastName}`,
        email: bookingData.email,
        phone: bookingData.phone,
      };

      // Always a PaymentIntent — even for $0 (coupon) orders the server issues a
      // $1 hold so the card is logged in Stripe and saved for future charges.
      // The worker cancels the hold after booking if amount_due = $0.
      console.log('Confirming card payment...');
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement, billing_details: billingDetails } }
      );
      if (confirmError) throw new Error(confirmError.message);
      if (!paymentIntent || paymentIntent.status !== 'requires_capture') {
        throw new Error(`Payment authorization failed. Status: ${paymentIntent?.status}`);
      }
      console.log('Payment authorized:', paymentIntent.id);
      const confirmedPaymentMethodId = paymentIntent.payment_method as string;
      const confirmedPaymentIntentId = paymentIntent.id;
      const confirmedPaymentStatus: 'authorized' | 'free' =
        calculateTotal() === 0 ? 'free' : 'authorized';

      // Get payment method details from Stripe
      let cardLast4 = '****';
      let cardBrand = 'card';
      try {
        const { data: paymentMethodData } = await supabase.functions.invoke('get-payment-method-details', {
          body: { paymentMethodId: confirmedPaymentMethodId }
        });
        
        if (paymentMethodData?.last4) {
          cardLast4 = paymentMethodData.last4;
          cardBrand = paymentMethodData.brand;
          console.log('Payment method details retrieved:', { last4: cardLast4, brand: cardBrand });
        }
      } catch (pmError) {
        console.error('Error fetching payment method details:', pmError);
        // Continue with default values
      }

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

      // Update client account with Stripe customer ID + saved payment method
      if (clientAccountId) {
        await supabase
          .from('Client_Accounts')
          .update({
            stripe_customer_id: customerId,
            default_payment_method_id: confirmedPaymentMethodId,
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

      // Fetch course details — prefer sessionStorage (has platform info) then DB fallback
      let facilityId: number | null = null;
      let hasOnlineBooking = null;
      let bookingPlatform = 'chronogolf';
      let platformCourseId = '';
      let platformBookingUrl = '';

      const storedCourse = sessionStorage.getItem('selectedCourse');
      if (storedCourse) {
        try {
          const sc = JSON.parse(storedCourse);
          if (sc.name === bookingData.preferredCourse) {
            facilityId        = sc.facilityId        ?? null;
            bookingPlatform   = sc.bookingPlatform   || 'chronogolf';
            platformCourseId  = sc.platformCourseId  || '';
            platformBookingUrl = sc.platformBookingUrl || '';
          }
        } catch (_) { /* ignore parse errors */ }
      }

      if (!facilityId && bookingData.preferredCourse) {
        try {
          const { data: courseData } = await (supabase as any)
            .from('Course_Database')
            .select('"Facility ID", "Tee Time Booking", booking_platform, platform_course_id, platform_booking_url')
            .eq('"Course Name"', bookingData.preferredCourse)
            .maybeSingle();

          if (courseData) {
            facilityId         = courseData["Facility ID"];
            hasOnlineBooking   = courseData["Tee Time Booking"];
            bookingPlatform    = courseData.booking_platform    || 'chronogolf';
            platformCourseId   = courseData.platform_course_id  || '';
            platformBookingUrl = courseData.platform_booking_url || '';
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
        payment_status: confirmedPaymentStatus,
        stripe_payment_method_id: confirmedPaymentMethodId,
        stripe_payment_intent_id: confirmedPaymentIntentId,
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

      // Dispatch automated booking job to Python worker
      let scheduledJobId: string | null = null;
      try {
        const { data: jobData } = await supabase.functions.invoke('create-scheduled-job', {
          body: {
            golfer_email:          bookingData.email,
            golfer_name:           `${bookingData.firstName} ${bookingData.lastName}`,
            facility_id:           facilityId,
            course_name:           bookingData.preferredCourse,
            booking_date:          bookingData.date,
            earliest_time:         convertTo24Hour(bookingData.earliestTime).slice(0, 5),
            latest_time:           convertTo24Hour(bookingData.latestTime).slice(0, 5),
            player_count:          bookingData.numberOfPlayers,
            fire_at:               new Date().toISOString(),
            booking_platform:      bookingPlatform,
            platform_course_id:    platformCourseId,
            platform_booking_url:  platformBookingUrl,
          }
        });
        scheduledJobId = jobData?.job_id ?? null;
      } catch (scheduleError) {
        console.error('Failed to create scheduled job (non-fatal):', scheduleError);
      }

      // Store confirmation data
      const confirmationData = {
        ...bookingData,
        totalPrice: calculateTotal(),
        promoCode,
        scheduledJobId,
        paymentMethod: {
          last4: cardLast4,
          cardType: `${cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1)} Card`
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
              id: confirmedPaymentIntentId ?? '',
              course: bookingData.preferredCourse,
              date: bookingData.date,
              players: bookingData.numberOfPlayers,
              totalPrice: calculateTotal(),
              isCustomCourse: facilityId !== null && facilityId >= 900000,
            }
          }
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
      }

      // If this is a custom course (user-added, not in DB yet), insert it now that payment is authorized
      try {
        const rawCourse = sessionStorage.getItem('selectedCourse');
        if (rawCourse) {
          const courseInfo = JSON.parse(rawCourse);
          if (courseInfo.isCustom) {
            const { data: existing } = await supabase
              .from('Course_Database')
              .select('"Facility ID"')
              .gte('"Facility ID"', 900000)
              .order('"Facility ID"', { ascending: false })
              .limit(1);
            const nextId = existing && existing.length > 0
              ? (existing[0]["Facility ID"] || 900000) + 1
              : 900001;
            await supabase.from('Course_Database').insert({
              "Facility ID": nextId,
              "Course Name": courseInfo.name,
              "Address": courseInfo.customCity
                ? `${courseInfo.customCity}${courseInfo.customState ? ', ' + courseInfo.customState : ''}`
                : null,
              "Source": 'user_added',
            });
            await supabase.functions.invoke('send-admin-alert', {
              body: {
                type: 'course_added',
                courseDetails: {
                  name: courseInfo.name,
                  city: courseInfo.customCity || '',
                  state: courseInfo.customState || '',
                  facilityId: nextId,
                },
              },
            });
          }
        }
      } catch (courseErr) {
        console.error('Custom course save error:', courseErr);
      }

      sessionStorage.removeItem('bookingData');
      
      toast({
        title: "Payment Authorized!",
        description: calculateTotal() === 0
          ? "A $1 hold has been placed to verify your card. It will be released once your tee time is confirmed."
          : "Your card has been authorized. We'll charge it once your tee time is confirmed.",
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
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
                    {new Date(bookingData.date + 'T00:00:00').toLocaleDateString('en-US', {
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
                
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                  <span className="text-muted-foreground flex items-center space-x-1 shrink-0">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span>Course:</span>
                  </span>
                  <span className="font-medium sm:text-right break-words">{bookingData.preferredCourse}</span>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Concierge Fee ({bookingData.numberOfPlayers} × $5):</span>
                    <span>${calculateSubtotal()}.00</span>
                  </div>
                  {appliedCoupon && calculateDiscount() > 0 && (
                    <div className="flex justify-between text-primary">
                      <span>Discount ({appliedCoupon.name}):</span>
                      <span>-${calculateDiscount().toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>${calculateTotal().toFixed(2)}</span>
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
                {'Your card will be authorized but not charged until your tee time is confirmed'}
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
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-md">
                        <div>
                          <span className="font-medium text-primary">{appliedCoupon.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({appliedCoupon.percentOff ? `${appliedCoupon.percentOff}% off` : `$${appliedCoupon.amountOff} off`})
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveCoupon}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          id="promoCode"
                          type="text"
                          placeholder="Enter promo code"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleApplyCoupon}
                          disabled={!promoCode.trim() || isValidatingCoupon}
                        >
                          {isValidatingCoupon ? "..." : "Apply"}
                        </Button>
                      </div>
                    )}
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
                      {calculateTotal() === 0
                        ? "Your promo code covers the full concierge fee. We'll place a temporary $1 hold to verify your card — it will be released once your tee time is confirmed."
                        : `Your payment information is encrypted and secure. We'll authorize your card for $${calculateTotal().toFixed(2)} and charge it only after we confirm your tee time booking.`}
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={!stripe || isProcessing}
                >
                  {isProcessing
                    ? 'Processing...'
                    : calculateTotal() === 0
                    ? 'Verify Card & Complete Booking'
                    : `Authorize Payment - $${calculateTotal().toFixed(2)}`}
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

  if (!stripeKey) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-lg font-semibold text-destructive mb-2">Payment Unavailable</p>
          <p className="text-muted-foreground">
            The payment system is not configured. Please contact support at{' '}
            <a href="mailto:support@holezygolf.com" className="underline">support@holezygolf.com</a>.
          </p>
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
