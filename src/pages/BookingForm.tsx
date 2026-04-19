import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, Users, MapPin, Phone, Mail, User, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AuthDialog from '@/components/AuthDialog';
import StateSelectionDialog from '@/components/StateSelectionDialog';
import { format } from 'date-fns';

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

interface StoredBookingDetails {
  players: number;
  date: string;
  earliestTime: number;
  latestTime: number;
  earliestTimeStr: string;
  latestTimeStr: string;
}

const BookingForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [user, setUser] = useState(null);
  const [storedDetails, setStoredDetails] = useState<StoredBookingDetails | null>(null);
  const [selectedStateCode, setSelectedStateCode] = useState<string | null>(null);
  const [bookingSummary, setBookingSummary] = useState<{
    course: string;
    date: string;
    players: number;
    earliestTime: string;
    latestTime: string;
  } | null>(null);
  
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
    loadBookingDetails();
  }, []);

  const loadBookingDetails = () => {
    const storedCourse = sessionStorage.getItem('selectedCourse');
    const storedDetailsStr = sessionStorage.getItem('bookingDetails');
    const storedState = sessionStorage.getItem('selectedState');
    
    if (storedState) {
      setSelectedStateCode(storedState);
    }
    
    if (storedCourse && storedDetailsStr) {
      try {
        const details: StoredBookingDetails = JSON.parse(storedDetailsStr);
        const dateObj = new Date(details.date);

        setStoredDetails(details);

        setBookingSummary({
          course: storedCourse,
          date: format(dateObj, 'PPP'),
          players: details.players,
          earliestTime: details.earliestTimeStr,
          latestTime: details.latestTimeStr,
        });

        // Pre-fill form data with booking details
        setFormData(prev => ({
          ...prev,
          date: dateObj.toISOString().split('T')[0],
          earliestTime: details.earliestTimeStr,
          latestTime: details.latestTimeStr,
          numberOfPlayers: details.players,
          preferredCourse: storedCourse,
        }));
      } catch (error) {
        console.error('Error parsing booking details:', error);
      }
    } else {
      // No booking details yet — open the selection wizard
      setShowBookingDialog(true);
    }
  };

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
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const US_STATES: Record<string, string> = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };

  const getStateFromCode = (code: string) => ({
    code,
    name: US_STATES[code] || code
  });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Book Your Tee Time</h1>
          <p className="text-lg text-muted-foreground">
            Complete your contact information below
          </p>
        </div>

        {/* Prompt when no booking details yet (user dismissed dialog or arrived fresh) */}
        {!bookingSummary && (
          <Card className="mb-6 border-dashed border-2 border-primary/30 bg-primary/5">
            <CardContent className="py-8 text-center space-y-4">
              <MapPin className="w-10 h-10 mx-auto text-primary/60" />
              <div>
                <p className="font-semibold text-lg">Select your tee time details</p>
                <p className="text-muted-foreground text-sm mt-1">Choose your course, date, time, and number of players to continue.</p>
              </div>
              <Button onClick={() => setShowBookingDialog(true)} className="px-8">
                Select a Tee Time
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Booking Summary */}
        {bookingSummary && (
          <Card className="mb-6 bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Your Selection
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowEditDialog(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1 col-span-2 md:col-span-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Course</p>
                  <p className="font-medium text-sm truncate">{bookingSummary.course}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
                  <p className="font-medium text-sm flex items-center gap-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span className="truncate">{bookingSummary.date}</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Players</p>
                  <p className="font-medium text-sm flex items-center gap-1">
                    <Users className="w-3 h-3 shrink-0" />
                    {bookingSummary.players} Player{bookingSummary.players > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Time</p>
                  <p className="font-medium text-sm flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">{bookingSummary.earliestTime} - {bookingSummary.latestTime}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="golf-card-shadow">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5 text-primary" />
              <span>Contact Information</span>
            </CardTitle>
            <CardDescription>
              We'll use this information to confirm your booking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
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

              <div className="pt-6">
                <Button 
                  type="submit" 
                  className="w-full text-lg py-6" 
                  disabled={!formData.preferredCourse.trim()}
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

        {/* Fresh booking dialog — shown when user arrives with no session data */}
        <StateSelectionDialog
          isOpen={showBookingDialog}
          onClose={() => setShowBookingDialog(false)}
          onStateSelect={() => {
            setShowBookingDialog(false);
            loadBookingDetails();
          }}
        />

        {/* Edit dialog — shown when user has existing booking details and clicks Edit */}
        {selectedStateCode && storedDetails && (
          <StateSelectionDialog
            isOpen={showEditDialog}
            onClose={() => setShowEditDialog(false)}
            initialStep="course"
            initialState={getStateFromCode(selectedStateCode)}
            initialCourse={formData.preferredCourse}
            initialBookingDetails={{
              players: storedDetails.players,
              date: storedDetails.date ? new Date(storedDetails.date) : undefined,
              earliestTime: storedDetails.earliestTime,
              latestTime: storedDetails.latestTime,
            }}
            onStateSelect={() => {
              setShowEditDialog(false);
              loadBookingDetails();
            }}
          />
        )}
      </div>
    </div>
  );
};

export default BookingForm;