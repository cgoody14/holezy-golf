import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface Course {
  "Course Name": string;
  "Address"?: string;
  "Facility ID"?: number;
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

const StateSelectionDialog = ({ isOpen, onClose, onStateSelect }: StateSelectionDialogProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState<{ code: string; name: string } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [courseSearchTerm, setCourseSearchTerm] = useState('');
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
    if (selectedState) {
      loadCourses(selectedState.name, courseSearchTerm);
    }
  }, [selectedState, courseSearchTerm, loadCourses]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedState(null);
      setSearchTerm('');
      setCourseSearchTerm('');
      setCourses([]);
    }
  }, [isOpen]);

  const handleStateSelect = (state: { code: string; name: string }) => {
    setSelectedState(state);
    sessionStorage.setItem('selectedState', state.code);
  };

  const handleCourseSelect = (courseName: string) => {
    sessionStorage.setItem('selectedCourse', courseName);
    onClose();
    if (onStateSelect) {
      onStateSelect(selectedState!.code);
    } else {
      navigate('/book');
    }
  };

  const handleBack = () => {
    setSelectedState(null);
    setCourseSearchTerm('');
    setCourses([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {selectedState ? (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <MapPin className="h-5 w-5 text-primary" />
                Courses in {selectedState.name}
              </>
            ) : (
              <>
                <MapPin className="h-5 w-5 text-primary" />
                Select Your State
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={selectedState ? "Search courses..." : "Search states..."}
              value={selectedState ? courseSearchTerm : searchTerm}
              onChange={(e) => selectedState ? setCourseSearchTerm(e.target.value) : setSearchTerm(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {/* States or Courses List */}
          <ScrollArea className="h-[350px] pr-4">
            {selectedState ? (
              // Courses View
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
                      : `No courses found in ${selectedState.name}`}
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
            ) : (
              // States View
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
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StateSelectionDialog;
