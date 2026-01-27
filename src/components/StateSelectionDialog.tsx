import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ChevronRight, ArrowLeft, Loader2, CalendarIcon, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Course {
  "Course Name": string;
  "Address"?: string;
  "Facility ID"?: number;
}

interface BookingDetails {
  players: number;
  date: Date | undefined;
  earliestTime: number; // minutes from midnight
  latestTime: number;
}

interface StateSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStateSelect?: (stateCode: string) => void;
}

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

// Convert minutes from midnight to time string (e.g., 360 -> "6:00 AM")
const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
};

type Step = 'state' | 'course' | 'details';

const StateSelectionDialog = ({ isOpen, onClose, onStateSelect }: StateSelectionDialogProps) => {
  const [step, setStep] = useState<Step>('state');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState<{ code: string; name: string } | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [courseSearchTerm, setCourseSearchTerm] = useState('');
  const [bookingDetails, setBookingDetails] = useState<BookingDetails>({
    players: 1,
    date: undefined,
    earliestTime: 360, // 6:00 AM
    latestTime: 1260, // 9:00 PM
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const navigate = useNavigate();

  // Filter states based on search
  const filteredStates = useMemo(() => {
    if (!searchTerm.trim()) return US_STATES;
    const search = searchTerm.toLowerCase();
    return US_STATES.filter(
      state =>
        state.name.toLowerCase().includes(search) ||
        state.code.toLowerCase().includes(search)
    );
  }, [searchTerm]);

  // Load courses when state is selected
  const loadCourses = useCallback(async (stateName: string, searchQuery?: string) => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('Course_Database')
        .select('"Course Name", "Address", "Facility ID"')
        .not('"Course Name"', 'is', null)
        .ilike('"Address"', `%${stateName}%`);

      if (searchQuery && searchQuery.trim()) {
        query = query.or(
          `"Course Name".ilike.%${searchQuery.trim()}%,"Address".ilike.%${searchQuery.trim()}%`
        );
      }

      const { data, error } = await query
        .order('"Course Name"')
        .limit(100);

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error('Error loading courses:', error);
      setCourses([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load courses when state changes or search changes
  useEffect(() => {
    if (selectedState && step === 'course') {
      loadCourses(selectedState.name, courseSearchTerm);
    }
  }, [selectedState, courseSearchTerm, loadCourses, step]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('state');
      setSelectedState(null);
      setSelectedCourse(null);
      setSearchTerm('');
      setCourseSearchTerm('');
      setCourses([]);
      setBookingDetails({
        players: 1,
        date: undefined,
        earliestTime: 360,
        latestTime: 1260,
      });
    }
  }, [isOpen]);

  const handleStateSelect = (state: { code: string; name: string }) => {
    setSelectedState(state);
    sessionStorage.setItem('selectedState', state.code);
    setStep('course');
  };

  const handleCourseSelect = (courseName: string) => {
    setSelectedCourse(courseName);
    sessionStorage.setItem('selectedCourse', courseName);
    setIsCalendarOpen(false);
    setStep('details');
  };

  const handleBack = () => {
    if (step === 'details') {
      setStep('course');
      setSelectedCourse(null);
    } else if (step === 'course') {
      setStep('state');
      setSelectedState(null);
      setCourseSearchTerm('');
      setCourses([]);
    }
  };

  const handleContinue = () => {
    // Store booking details in session storage
    sessionStorage.setItem('bookingDetails', JSON.stringify({
      ...bookingDetails,
      date: bookingDetails.date?.toISOString(),
      earliestTimeStr: minutesToTimeString(bookingDetails.earliestTime),
      latestTimeStr: minutesToTimeString(bookingDetails.latestTime),
    }));
    
    onClose();
    if (onStateSelect) {
      onStateSelect(selectedState!.code);
    } else {
      navigate('/book');
    }
  };

  const handleEarliestTimeChange = (value: number[]) => {
    const newEarliest = value[0];
    setBookingDetails(prev => ({
      ...prev,
      earliestTime: newEarliest,
      // Ensure latest is at least 30 min after earliest
      latestTime: Math.max(prev.latestTime, newEarliest + 30),
    }));
  };

  const handleLatestTimeChange = (value: number[]) => {
    const newLatest = value[0];
    setBookingDetails(prev => ({
      ...prev,
      latestTime: newLatest,
      // Ensure earliest is at least 30 min before latest
      earliestTime: Math.min(prev.earliestTime, newLatest - 30),
    }));
  };

  const getTitle = () => {
    switch (step) {
      case 'state':
        return (
          <>
            <MapPin className="h-5 w-5 text-primary" />
            Select Your State
          </>
        );
      case 'course':
        return (
          <>
            <button
              type="button"
              onClick={handleBack}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <MapPin className="h-5 w-5 text-primary" />
            Courses in {selectedState?.name}
          </>
        );
      case 'details':
        return (
          <>
            <button
              type="button"
              onClick={handleBack}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <CalendarIcon className="h-5 w-5 text-primary" />
            Booking Details
          </>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'state' && (
            <>
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search states..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>

              {/* States List */}
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-1">
                  {filteredStates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No states found matching "{searchTerm}"
                    </div>
                  ) : (
                    filteredStates.map((state) => (
                      <button
                        key={state.code}
                        type="button"
                        onClick={() => handleStateSelect(state)}
                        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                            {state.code}
                          </span>
                          <span className="font-medium">{state.name}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {step === 'course' && (
            <>
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search courses..."
                  value={courseSearchTerm}
                  onChange={(e) => setCourseSearchTerm(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>

              {/* Courses List */}
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-1">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="ml-2 text-muted-foreground">Loading courses...</span>
                    </div>
                  ) : courses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {courseSearchTerm
                        ? `No courses found matching "${courseSearchTerm}"`
                        : `No courses found in ${selectedState?.name}`}
                    </div>
                  ) : (
                    courses.map((course, index) => (
                      <button
                        key={`${course["Facility ID"]}-${index}`}
                        type="button"
                        onClick={() => handleCourseSelect(course["Course Name"]!)}
                        className="w-full flex flex-col p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                      >
                        <span className="font-medium truncate">{course["Course Name"]}</span>
                        {course["Address"] && (
                          <span className="text-sm text-muted-foreground truncate">
                            {course["Address"]}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {step === 'details' && (
            <div className="space-y-6">
              {/* Selected Course Display */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Selected Course</span>
                <p className="font-medium truncate">{selectedCourse}</p>
              </div>

              {/* Number of Players */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  Number of Players
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBookingDetails(prev => ({ ...prev, players: num }))}
                      className={cn(
                        "flex-1 py-3 rounded-lg font-medium transition-colors border",
                        bookingDetails.players === num
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted/50 border-input"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Date */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  Preferred Date
                </label>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !bookingDetails.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {bookingDetails.date ? format(bookingDetails.date, "PPP") : "Select a date"}
                </Button>
                {isCalendarOpen && (
                  <div className="flex justify-center border rounded-lg p-3 bg-background">
                    <Calendar
                      mode="single"
                      selected={bookingDetails.date}
                      onSelect={(date) => {
                        setBookingDetails(prev => ({ ...prev, date }));
                        setIsCalendarOpen(false);
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className={cn("p-0 pointer-events-auto")}
                    />
                  </div>
                )}
              </div>

              {/* Time Window */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-primary" />
                  Time Window
                </label>

                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Earliest</span>
                  <span>Latest</span>
                </div>

                <div className="relative">
                  <Slider
                    value={[bookingDetails.earliestTime, bookingDetails.latestTime]}
                    onValueChange={(values) => {
                      setBookingDetails(prev => ({
                        ...prev,
                        earliestTime: values[0],
                        latestTime: values[1],
                      }));
                    }}
                    min={360}
                    max={1260}
                    step={30}
                    minStepsBetweenThumbs={1}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{minutesToTimeString(bookingDetails.earliestTime)}</span>
                  <span className="text-xs text-muted-foreground">6 AM - 9 PM</span>
                  <span>{minutesToTimeString(bookingDetails.latestTime)}</span>
                </div>
              </div>

              {/* Continue Button */}
              <Button
                onClick={handleContinue}
                className="w-full"
                disabled={!bookingDetails.date}
              >
                Continue to Booking
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StateSelectionDialog;