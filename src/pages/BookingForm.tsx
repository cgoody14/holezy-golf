import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarIcon, Clock, Users, MapPin, Phone, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AuthDialog from '@/components/AuthDialog';
import CourseSelector from '@/components/CourseSelector';

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

const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
};

const BookingForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [earliestTime, setEarliestTime] = useState(360);  // 6:00 AM
  const [latestTime, setLatestTime] = useState(1260);     // 9:00 PM

  const [formData, setFormData] = useState<BookingData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    date: '',
    earliestTime: '',
    latestTime: '',
    numberOfPlayers: 1,
    preferredCourse: '',
  });

  useEffect(() => {
    checkAuth();
    // Restore any previously saved selections from sessionStorage
    const storedCourse = sessionStorage.getItem('selectedCourse');
    const storedDetails = sessionStorage.getItem('bookingDetails');
    if (storedCourse && storedDetails) {
      try {
        const d = JSON.parse(storedDetails);
        if (d.date) setSelectedDate(new Date(d.date));
        if (d.earliestTime) setEarliestTime(d.earliestTime);
        if (d.latestTime) setLatestTime(d.latestTime);
        const courseName = typeof storedCourse === 'string' && storedCourse.startsWith('{')
          ? JSON.parse(storedCourse).name
          : storedCourse;
        setFormData(prev => ({
          ...prev,
          preferredCourse: courseName || '',
          numberOfPlayers: d.players || 1,
          date: d.date ? new Date(d.date).toISOString().split('T')[0] : '',
          earliestTime: d.earliestTimeStr || minutesToTimeString(d.earliestTime || 360),
          latestTime:   d.latestTimeStr   || minutesToTimeString(d.latestTime   || 1260),
        }));
      } catch { /* ignore */ }
    }
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user) await populateUserData(session.user);
  };

  const populateUserData = async (authUser: any) => {
    try {
      const { data: account, error } = await supabase
        .from('Client_Accounts')
        .select('first_name, last_name, email, phone')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (account && !error) {
        setFormData(prev => ({
          ...prev,
          firstName: account.first_name || '',
          lastName:  account.last_name  || '',
          email:     account.email      || authUser.email || '',
          phone:     account.phone      || '',
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          email:     authUser.email                        || '',
          firstName: authUser.user_metadata?.first_name   || '',
          lastName:  authUser.user_metadata?.last_name    || '',
          phone:     authUser.user_metadata?.phone        || '',
        }));
      }
    } catch {
      setFormData(prev => ({
        ...prev,
        email:     authUser.email                        || '',
        firstName: authUser.user_metadata?.first_name   || '',
        lastName:  authUser.user_metadata?.last_name    || '',
        phone:     authUser.user_metadata?.phone        || '',
      }));
    }
  };

  const update = (field: keyof BookingData, value: string | number) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setShowCalendar(false);
    if (date) update('date', date.toISOString().split('T')[0]);
  };

  const handleEarliestChange = (vals: number[]) => {
    const v = vals[0];
    setEarliestTime(v);
    setLatestTime(prev => Math.max(prev, v + 30));
    update('earliestTime', minutesToTimeString(v));
  };

  const handleLatestChange = (vals: number[]) => {
    const v = vals[0];
    setLatestTime(v);
    setEarliestTime(prev => Math.min(prev, v - 30));
    update('latestTime', minutesToTimeString(v));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.preferredCourse.trim()) {
      toast({ title: "Missing Information", description: "Please select a golf course", variant: "destructive" });
      return;
    }
    if (!formData.date) {
      toast({ title: "Missing Information", description: "Please select a date", variant: "destructive" });
      return;
    }
    if (!formData.firstName.trim()) {
      toast({ title: "Missing Information", description: "Please enter your first name", variant: "destructive" });
      return;
    }
    if (!formData.lastName.trim()) {
      toast({ title: "Missing Information", description: "Please enter your last name", variant: "destructive" });
      return;
    }
    if (!formData.email.trim()) {
      toast({ title: "Missing Information", description: "Please enter your email address", variant: "destructive" });
      return;
    }
    if (!formData.phone.trim()) {
      toast({ title: "Missing Information", description: "Please enter your phone number", variant: "destructive" });
      return;
    }

    // Save full booking details so Checkout can read them
    const payload = {
      ...formData,
      earliestTime: minutesToTimeString(earliestTime),
      latestTime:   minutesToTimeString(latestTime),
    };
    sessionStorage.setItem('bookingData', JSON.stringify(payload));
    sessionStorage.setItem('bookingDetails', JSON.stringify({
      players:         formData.numberOfPlayers,
      date:            selectedDate?.toISOString(),
      earliestTime,
      latestTime,
      earliestTimeStr: minutesToTimeString(earliestTime),
      latestTimeStr:   minutesToTimeString(latestTime),
    }));

    if (!user) {
      setShowAuthDialog(true);
      return;
    }
    navigate('/checkout');
  };

  const canSubmit =
    formData.preferredCourse.trim() &&
    formData.date &&
    formData.firstName.trim() &&
    formData.lastName.trim() &&
    formData.email.trim() &&
    formData.phone.trim();

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Book Your Tee Time</h1>
          <p className="text-muted-foreground">Fill in the details below and we'll secure your spot.</p>
        </div>

        {/* ── 1. Course ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-4 h-4 text-primary" />
              Golf Course
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CourseSelector
              selectedCourse={formData.preferredCourse}
              onCourseSelect={(name) => update('preferredCourse', name)}
            />
          </CardContent>
        </Card>

        {/* ── 2. Date ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarIcon className="w-4 h-4 text-primary" />
              Preferred Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCalendar(!showCalendar)}
              className={cn('w-full justify-start text-left font-normal', !selectedDate && 'text-muted-foreground')}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, 'PPP') : 'Select a date'}
            </Button>
            {showCalendar && (
              <div className="mt-3 flex justify-center border rounded-lg p-3 bg-background">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 3. Time window & Players ──────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-primary" />
              Time &amp; Players
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Time range */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Preferred tee-time window</Label>
              <Slider
                value={[earliestTime, latestTime]}
                onValueChange={(vals) => {
                  setEarliestTime(vals[0]);
                  setLatestTime(vals[1]);
                  update('earliestTime', minutesToTimeString(vals[0]));
                  update('latestTime',   minutesToTimeString(vals[1]));
                }}
                min={360}
                max={1260}
                step={30}
                minStepsBetweenThumbs={1}
              />
              <div className="flex justify-between text-sm font-medium">
                <span>{minutesToTimeString(earliestTime)}</span>
                <span className="text-xs text-muted-foreground">6 AM – 9 PM</span>
                <span>{minutesToTimeString(latestTime)}</span>
              </div>
            </div>

            {/* Players */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-primary" />
                Number of Players
              </Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update('numberOfPlayers', n)}
                    className={cn(
                      'flex-1 py-3 rounded-lg font-medium transition-colors border',
                      formData.numberOfPlayers === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted/50 border-input'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 4. Contact Info ───────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4 text-primary" />
              Your Information
            </CardTitle>
            <CardDescription>We'll use this to confirm your booking.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => update('firstName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) => update('lastName', e.target.value)}
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
                    onChange={(e) => update('email', e.target.value)}
                    className="pl-10"
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
                    onChange={(e) => update('phone', e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full text-base py-6"
                  disabled={!canSubmit}
                >
                  Continue to Checkout
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => setShowAuthDialog(false)}
          onSuccess={() => { checkAuth(); navigate('/checkout'); }}
        />
      </div>
    </div>
  );
};

export default BookingForm;
