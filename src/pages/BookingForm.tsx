import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Users, MapPin, Phone, Mail, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import CourseSelector from '@/components/CourseSelector';
import AuthDialog from '@/components/AuthDialog';

export interface BookingData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  date: string;
  earliestTime: string;
  latestTime: string;
  numberOfPlayers: number;
  preferredCourse: string;
}

const BookingForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [user, setUser] = useState(null);
  
  const [formData, setFormData] = useState<BookingData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    date: '',
    earliestTime: '',
    latestTime: '',
    numberOfPlayers: 1,
    preferredCourse: ''
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    
    // Auto-populate form with user data if logged in
    if (session?.user) {
      await populateUserData(session.user);
    }
  };

  const populateUserData = async (user: any) => {
    try {
      // First try to get data from Client_Accounts table
      const { data: clientAccount, error } = await supabase
        .from('Client_Accounts')
        .select('first_name, last_name, email, phone')
        .eq('user_id', user.id)
        .maybeSingle();

      if (clientAccount && !error) {
        setFormData(prev => ({
          ...prev,
          firstName: clientAccount.first_name || '',
          lastName: clientAccount.last_name || '',
          email: clientAccount.email || user.email || '',
          phone: clientAccount.phone || ''
        }));
      } else {
        // Fallback to auth user data
        setFormData(prev => ({
          ...prev,
          email: user.email || '',
          firstName: user.user_metadata?.first_name || '',
          lastName: user.user_metadata?.last_name || '',
          phone: user.user_metadata?.phone || ''
        }));
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Fallback to auth user data
      setFormData(prev => ({
        ...prev,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        phone: user.user_metadata?.phone || ''
      }));
    }
  };

  const timeSlots = [
    '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
    '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
    '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM'
  ];

  const isTimeValid = () => {
    if (!formData.earliestTime || !formData.latestTime) return true;
    
    const earliestIndex = timeSlots.indexOf(formData.earliestTime);
    const latestIndex = timeSlots.indexOf(formData.latestTime);
    
    return latestIndex >= earliestIndex;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.firstName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your first name",
        variant: "destructive"
      });
      return;
    }

    if (!formData.lastName.trim()) {
      toast({
        title: "Missing Information", 
        description: "Please enter your last name",
        variant: "destructive"
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your email address",
        variant: "destructive"
      });
      return;
    }

    if (!formData.phone.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your phone number",
        variant: "destructive"
      });
      return;
    }

    if (!formData.date) {
      toast({
        title: "Missing Information",
        description: "Please select a date",
        variant: "destructive"
      });
      return;
    }

    // Validate date is not in the past
    const selectedDate = new Date(formData.date);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < todayDate) {
      toast({
        title: "Invalid Date",
        description: "Please select today or a future date",
        variant: "destructive"
      });
      return;
    }

    if (!formData.earliestTime) {
      toast({
        title: "Missing Information",
        description: "Please select your earliest preferred time",
        variant: "destructive"
      });
      return;
    }

    if (!formData.latestTime) {
      toast({
        title: "Missing Information",
        description: "Please select your latest preferred time",
        variant: "destructive"
      });
      return;
    }

    if (!isTimeValid()) {
      toast({
        title: "Invalid Time Range",
        description: "Latest time cannot be earlier than earliest time",
        variant: "destructive"
      });
      return;
    }


    // Check if user is authenticated
    if (!user) {
      // Store form data temporarily and show auth dialog
      sessionStorage.setItem('bookingData', JSON.stringify(formData));
      setShowAuthDialog(true);
      return;
    }

    // Store form data and navigate to checkout
    sessionStorage.setItem('bookingData', JSON.stringify(formData));
    navigate('/checkout');
  };

  const updateFormData = (field: keyof BookingData, value: string | number) => {
    // Validate date in real-time to prevent past dates on mobile
    if (field === 'date' && typeof value === 'string') {
      const selectedDate = new Date(value);
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < todayDate) {
        toast({
          title: "Invalid Date",
          description: "Please select today or a future date",
          variant: "destructive"
        });
        return; // Don't update if date is in the past
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Get today's date for min date validation
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Book Your Tee Time</h1>
          <p className="text-lg text-muted-foreground">
            Tell us your preferences and we'll handle the rest
          </p>
        </div>

        <Card className="golf-card-shadow">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span>Booking Details</span>
            </CardTitle>
            <CardDescription>
              Fill out your information and preferences below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                  <User className="w-4 h-4 text-primary" />
                  <span>Contact Information</span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={formData.firstName}
                      onChange={(e) => updateFormData('firstName', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => updateFormData('lastName', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={(e) => updateFormData('email', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => updateFormData('phone', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Booking Preferences */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>Tee Time Preferences</span>
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="date">Preferred Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    min={today}
                    value={formData.date}
                    onChange={(e) => updateFormData('date', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="earliestTime">Earliest Time *</Label>
                    <Select
                      value={formData.earliestTime}
                      onValueChange={(value) => updateFormData('earliestTime', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select earliest time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((time) => (
                          <SelectItem key={time} value={time}>
                            <div className="flex items-center space-x-2">
                              <Clock className="w-4 h-4" />
                              <span>{time}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="latestTime">Latest Time *</Label>
                    <Select
                      value={formData.latestTime}
                      onValueChange={(value) => updateFormData('latestTime', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select latest time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots
                          .filter(time => {
                            if (!formData.earliestTime) return true;
                            const earliestIndex = timeSlots.indexOf(formData.earliestTime);
                            const currentIndex = timeSlots.indexOf(time);
                            return currentIndex >= earliestIndex;
                          })
                          .map((time) => (
                            <SelectItem key={time} value={time}>
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4" />
                                <span>{time}</span>
                              </div>
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!isTimeValid() && (
                  <p className="text-sm text-destructive">
                    Latest time cannot be earlier than earliest time
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="numberOfPlayers">Number of Players *</Label>
                  <Select
                    value={formData.numberOfPlayers.toString()}
                    onValueChange={(value) => updateFormData('numberOfPlayers', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select number of players" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          <div className="flex items-center space-x-2">
                            <Users className="w-4 h-4" />
                            <span>{num} Player{num > 1 ? 's' : ''}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preferredCourse">Preferred Golf Course *</Label>
                  <CourseSelector
                    selectedCourse={formData.preferredCourse}
                    onCourseSelect={(courseName) => updateFormData('preferredCourse', courseName)}
                  />
                </div>
              </div>

              <div className="pt-6">
                <Button 
                  type="submit" 
                  className="w-full text-lg py-6" 
                  disabled={!isTimeValid() || !formData.preferredCourse.trim()}
                >
                  <MapPin className="w-5 h-5 mr-2" />
                  Continue to Checkout
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => setShowAuthDialog(false)}
          onSuccess={() => {
            checkAuth();
            navigate('/checkout');
          }}
        />
      </div>
    </div>
  );
};

export default BookingForm;