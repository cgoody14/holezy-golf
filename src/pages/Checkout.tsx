import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Calendar, Clock, Users, MapPin, Tag, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { BookingData } from './BookingForm';

const Checkout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Credit card form fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');

  useEffect(() => {
    // Get booking data from session storage
    const storedData = sessionStorage.getItem('bookingData');
    if (storedData) {
      const data = JSON.parse(storedData);
      setBookingData(data);
      setCardName(`${data.firstName} ${data.lastName}`);
    } else {
      // Redirect back to booking form if no data
      navigate('/book');
    }
  }, [navigate]);

  const calculateTotal = () => {
    if (!bookingData) return 0;
    return bookingData.numberOfPlayers * 5; // $5 per player
  };

  const formatCardNumber = (value: string) => {
    // Remove all non-digit characters
    const cleanValue = value.replace(/\D/g, '');
    // Add spaces every 4 digits
    const formatted = cleanValue.replace(/(\d{4})(?=\d)/g, '$1 ');
    return formatted.substring(0, 19); // Max 16 digits + 3 spaces
  };

  const formatExpiryDate = (value: string) => {
    // Remove all non-digit characters
    const cleanValue = value.replace(/\D/g, '');
    // Add slash after first 2 digits
    if (cleanValue.length >= 2) {
      return cleanValue.substring(0, 2) + '/' + cleanValue.substring(2, 4);
    }
    return cleanValue;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiryDate(e.target.value);
    setExpiryDate(formatted);
  };

  const validateForm = () => {
    if (!bookingData) return false;
    
    if (!cardNumber.replace(/\s/g, '') || cardNumber.replace(/\s/g, '').length < 13) {
      toast({
        title: "Invalid Card Number",
        description: "Please enter a valid credit card number",
        variant: "destructive"
      });
      return false;
    }

    if (!expiryDate || expiryDate.length < 5) {
      toast({
        title: "Invalid Expiry Date",
        description: "Please enter a valid expiry date (MM/YY)",
        variant: "destructive"
      });
      return false;
    }

    if (!cvv || cvv.length < 3) {
      toast({
        title: "Invalid CVV",
        description: "Please enter a valid CVV code",
        variant: "destructive"
      });
      return false;
    }

    if (!cardName.trim()) {
      toast({
        title: "Missing Name",
        description: "Please enter the name on your card",
        variant: "destructive"
      });
      return false;
    }

    if (!termsAccepted) {
      toast({
        title: "Terms Required",
        description: "Please accept the terms and conditions to continue",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !bookingData) return;

    setIsProcessing(true);

    try {
      // Get current user session (guests allowed)
      const { data: { session } } = await supabase.auth.getSession();
      let clientAccountId: number | null = null;
      if (session?.user) {
        // Try to find existing account
        const { data: clientAccount, error: clientError } = await supabase
          .from('Client_Accounts')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (!clientError && clientAccount?.id) {
          clientAccountId = clientAccount.id;
        } else {
          // Create or fetch account row for this user
          const { data: upserted, error: upsertError } = await supabase
            .from('Client_Accounts')
            .upsert(
              {
                user_id: session.user.id,
                email: session.user.email,
                first_name: bookingData.firstName,
                last_name: bookingData.lastName,
                phone: bookingData.phone
              },
              { onConflict: 'user_id' }
            )
            .select('id')
            .single();

          if (!upsertError && upserted?.id) {
            clientAccountId = upserted.id;
          }
        }
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

      // Update client account with contact info and store payment method (if signed in)
      const lastFourDigits = cardNumber.replace(/\s/g, '').slice(-4);
      if (clientAccountId) {
        const { error: updateError } = await supabase
          .from('Client_Accounts')
          .update({ 
            phone: bookingData.phone,
            email: bookingData.email,
            // Store encrypted payment info (in real app, use proper encryption)
            default_payment_method_id: `card_****${lastFourDigits}`
          })
          .eq('id', clientAccountId);

        if (updateError) {
          console.error('Failed to update client account:', updateError);
        }
      }

      // Save booking to database with payment information
      const bookingRecord = {
        client_id: clientAccountId,
        First: bookingData.firstName,
        Last: bookingData.lastName,
        email: bookingData.email,
        phone: bookingData.phone,
        booking_date: bookingData.date,
        earliest_time: convertTo24Hour(bookingData.earliestTime),
        latest_time: convertTo24Hour(bookingData.latestTime),
        number_of_players: bookingData.numberOfPlayers,
        preferred_course: bookingData.preferredCourse,
        booking_status: 'pending',
        total_price: calculateTotal(),
        promo_code: promoCode || null,
        payment_status: 'pending',
        stripe_payment_method_id: `card_****${lastFourDigits}`,
        amount_charged: calculateTotal(),
        currency: 'usd',
        stripe_payment_intent_id: null // Will be updated when charged manually
      };

      const { error: dbError } = await supabase
        .from('Client_Bookings')
        .insert([bookingRecord]);

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save booking');
      }

      // Store booking data and payment info for confirmation page
      const confirmationData = {
        ...bookingData,
        totalPrice: calculateTotal(),
        promoCode,
        paymentMethod: {
          last4: cardNumber.slice(-4),
          cardType: 'Credit Card'
        }
      };
      
      sessionStorage.setItem('confirmationData', JSON.stringify(confirmationData));
      
      // Send confirmation email
      console.log('Attempting to send confirmation email to:', bookingData.email);
      try {
        const emailPayload = {
          ...confirmationData,
          type: 'booking_confirmation',
          firstName: bookingData.firstName,
          lastName: bookingData.lastName,
          email: bookingData.email
        };
        console.log('Email payload:', emailPayload);
        
        const emailResponse = await supabase.functions.invoke('send-booking-confirmation', {
          body: emailPayload
        });
        
        console.log('Email function response:', emailResponse);
        
        if (emailResponse.error) {
          console.error('Email function returned error:', emailResponse.error);
        } else {
          console.log('Email sent successfully');
        }
      } catch (emailError) {
        console.error('Email error caught:', emailError);
        // Don't fail the booking if email fails
      }

      // Send admin alert for new booking
      try {
        await supabase.functions.invoke('send-admin-alert', {
          body: {
            type: 'booking_made',
            userEmail: bookingData.email,
            userName: `${bookingData.firstName} ${bookingData.lastName}`,
            bookingDetails: {
              id: Date.now().toString(), // Use timestamp as ID for demo
              course: bookingData.preferredCourse,
              date: bookingData.date,
              players: bookingData.numberOfPlayers,
              totalPrice: calculateTotal()
            }
          }
        });
      } catch (alertError) {
        console.error('Admin alert error:', alertError);
        // Don't fail the booking if alert fails
      }

      // Clear booking data from session storage
      sessionStorage.removeItem('bookingData');
      
      toast({
        title: "Booking Submitted!",
        description: "Your tee time request has been received. We'll confirm your booking shortly."
      });

      navigate('/confirmation');
    } catch (error) {
      console.error('Booking error:', error);
      toast({
        title: "Booking Failed",
        description: "There was an error processing your booking. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

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
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Secure Your Tee Time</h1>
          <p className="text-lg text-muted-foreground">
            Review your booking details and complete payment
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
                <CreditCard className="w-5 h-5 text-primary" />
                <span>Payment Information</span>
              </CardTitle>
              <CardDescription>
                We'll securely store your payment method for manual processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card Number *</Label>
                    <Input
                      id="cardNumber"
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      maxLength={19}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Expiry Date *</Label>
                      <Input
                        id="expiryDate"
                        type="text"
                        placeholder="MM/YY"
                        value={expiryDate}
                        onChange={handleExpiryChange}
                        maxLength={5}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cvv">CVV *</Label>
                      <Input
                        id="cvv"
                        type="text"
                        placeholder="123"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                        maxLength={4}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cardName">Name on Card *</Label>
                    <Input
                      id="cardName"
                      type="text"
                      placeholder="John Doe"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="promoCode">Promo Code (Optional)</Label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="promoCode"
                        type="text"
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                    />
                    <Label htmlFor="terms" className="text-sm leading-relaxed">
                      I accept the{' '}
                      <button type="button" className="text-primary underline">
                        Terms and Conditions
                      </button>{' '}
                      and understand that this is a booking request that will be manually processed.
                    </Label>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-muted-foreground">
                        <p className="font-medium mb-1">Secure Payment Processing</p>
                        <p>
                          Your payment information is securely stored and will only be charged 
                          once we confirm your tee time availability. You'll receive an email 
                          confirmation with all details.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full text-lg py-6" 
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 mr-2" />
                      Secure My Tee Time
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Checkout;