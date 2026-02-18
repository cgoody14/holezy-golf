import { useState, useEffect, useMemo, lazy, Suspense, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ChevronRight, Loader2, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

// Dynamically import the map component to avoid SSR/React 18 context issues
const CourseMap = lazy(() => import('@/components/CourseMap'));

// Geocode cache in localStorage
const GEOCODE_CACHE_KEY = 'holezy_geocode_cache';

const getGeocodeCache = (): Record<string, { lat: number; lng: number }> => {
  try {
    const cached = localStorage.getItem(GEOCODE_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setGeocodeCache = (cache: Record<string, { lat: number; lng: number }>) => {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full, ignore
  }
};

const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': 'HolezyGolfApp/1.0' } }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Seeded random fallback for courses that can't be geocoded
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

interface Course {
  "Course Name": string;
  "Address": string | null;
  "Facility ID": number;
  "Phone": string | null;
  "Course Website": string | null;
}

interface GeocodedCourse extends Course {
  lat: number;
  lng: number;
}

const US_STATES = [
  { code: 'AL', name: 'Alabama', lat: 32.806671, lng: -86.791130 },
  { code: 'AK', name: 'Alaska', lat: 61.370716, lng: -152.404419 },
  { code: 'AZ', name: 'Arizona', lat: 33.729759, lng: -111.431221 },
  { code: 'AR', name: 'Arkansas', lat: 34.969704, lng: -92.373123 },
  { code: 'CA', name: 'California', lat: 36.116203, lng: -119.681564 },
  { code: 'CO', name: 'Colorado', lat: 39.059811, lng: -105.311104 },
  { code: 'CT', name: 'Connecticut', lat: 41.597782, lng: -72.755371 },
  { code: 'DE', name: 'Delaware', lat: 39.318523, lng: -75.507141 },
  { code: 'FL', name: 'Florida', lat: 27.766279, lng: -81.686783 },
  { code: 'GA', name: 'Georgia', lat: 33.040619, lng: -83.643074 },
  { code: 'HI', name: 'Hawaii', lat: 21.094318, lng: -157.498337 },
  { code: 'ID', name: 'Idaho', lat: 44.240459, lng: -114.478828 },
  { code: 'IL', name: 'Illinois', lat: 40.349457, lng: -88.986137 },
  { code: 'IN', name: 'Indiana', lat: 39.849426, lng: -86.258278 },
  { code: 'IA', name: 'Iowa', lat: 42.011539, lng: -93.210526 },
  { code: 'KS', name: 'Kansas', lat: 38.526600, lng: -96.726486 },
  { code: 'KY', name: 'Kentucky', lat: 37.668140, lng: -84.670067 },
  { code: 'LA', name: 'Louisiana', lat: 31.169546, lng: -91.867805 },
  { code: 'ME', name: 'Maine', lat: 44.693947, lng: -69.381927 },
  { code: 'MD', name: 'Maryland', lat: 39.063946, lng: -76.802101 },
  { code: 'MA', name: 'Massachusetts', lat: 42.230171, lng: -71.530106 },
  { code: 'MI', name: 'Michigan', lat: 43.326618, lng: -84.536095 },
  { code: 'MN', name: 'Minnesota', lat: 45.694454, lng: -93.900192 },
  { code: 'MS', name: 'Mississippi', lat: 32.741646, lng: -89.678696 },
  { code: 'MO', name: 'Missouri', lat: 38.456085, lng: -92.288368 },
  { code: 'MT', name: 'Montana', lat: 46.921925, lng: -110.454353 },
  { code: 'NE', name: 'Nebraska', lat: 41.125370, lng: -98.268082 },
  { code: 'NV', name: 'Nevada', lat: 38.313515, lng: -117.055374 },
  { code: 'NH', name: 'New Hampshire', lat: 43.452492, lng: -71.563896 },
  { code: 'NJ', name: 'New Jersey', lat: 40.298904, lng: -74.521011 },
  { code: 'NM', name: 'New Mexico', lat: 34.840515, lng: -106.248482 },
  { code: 'NY', name: 'New York', lat: 42.165726, lng: -74.948051 },
  { code: 'NC', name: 'North Carolina', lat: 35.630066, lng: -79.806419 },
  { code: 'ND', name: 'North Dakota', lat: 47.528912, lng: -99.784012 },
  { code: 'OH', name: 'Ohio', lat: 40.388783, lng: -82.764915 },
  { code: 'OK', name: 'Oklahoma', lat: 35.565342, lng: -96.928917 },
  { code: 'OR', name: 'Oregon', lat: 44.572021, lng: -122.070938 },
  { code: 'PA', name: 'Pennsylvania', lat: 40.590752, lng: -77.209755 },
  { code: 'RI', name: 'Rhode Island', lat: 41.680893, lng: -71.511780 },
  { code: 'SC', name: 'South Carolina', lat: 33.856892, lng: -80.945007 },
  { code: 'SD', name: 'South Dakota', lat: 44.299782, lng: -99.438828 },
  { code: 'TN', name: 'Tennessee', lat: 35.747845, lng: -86.692345 },
  { code: 'TX', name: 'Texas', lat: 31.054487, lng: -97.563461 },
  { code: 'UT', name: 'Utah', lat: 40.150032, lng: -111.862434 },
  { code: 'VT', name: 'Vermont', lat: 44.045876, lng: -72.710686 },
  { code: 'VA', name: 'Virginia', lat: 37.769337, lng: -78.169968 },
  { code: 'WA', name: 'Washington', lat: 47.400902, lng: -121.490494 },
  { code: 'WV', name: 'West Virginia', lat: 38.491226, lng: -80.954456 },
  { code: 'WI', name: 'Wisconsin', lat: 44.268543, lng: -89.616508 },
  { code: 'WY', name: 'Wyoming', lat: 42.755966, lng: -107.302490 },
  { code: 'DC', name: 'District of Columbia', lat: 38.897438, lng: -77.026817 },
];

const MapLoader = () => (
  <div className="h-full flex items-center justify-center bg-muted/20">
    <div className="text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
      <p className="text-muted-foreground">Loading map...</p>
    </div>
  </div>
);

const Courses = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState<typeof US_STATES[0] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [geocodedCourses, setGeocodedCourses] = useState<GeocodedCourse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [courseSearchTerm, setCourseSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<GeocodedCourse | null>(null);
  const courseListRef = useRef<HTMLDivElement>(null);
  const geocodeAbortRef = useRef(false);

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

  // Geocode courses progressively
  const geocodeCourses = useCallback(async (coursesToGeocode: Course[], state: typeof US_STATES[0]) => {
    const cache = getGeocodeCache();
    setIsGeocoding(true);
    geocodeAbortRef.current = false;

    // First pass: apply cached coordinates or fallback
    const initial: GeocodedCourse[] = coursesToGeocode.map((course, index) => {
      const cacheKey = `${course["Facility ID"]}`;
      if (cache[cacheKey]) {
        return { ...course, lat: cache[cacheKey].lat, lng: cache[cacheKey].lng };
      }
      // Fallback to seeded random until geocoded
      const seed = course["Facility ID"] || index;
      return {
        ...course,
        lat: state.lat + (seededRandom(seed) - 0.5) * 3,
        lng: state.lng + (seededRandom(seed + 1000) - 0.5) * 4,
      };
    });
    setGeocodedCourses(initial);

    // Second pass: geocode uncached courses
    const uncached = coursesToGeocode
      .map((c, i) => ({ course: c, index: i }))
      .filter(({ course }) => !cache[`${course["Facility ID"]}`] && course["Address"]);

    for (let i = 0; i < uncached.length; i++) {
      if (geocodeAbortRef.current) break;
      const { course, index } = uncached[i];
      const result = await geocodeAddress(course["Address"]!);
      if (result) {
        cache[`${course["Facility ID"]}`] = result;
        setGeocodeCache(cache);
        setGeocodedCourses(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], lat: result.lat, lng: result.lng };
          return updated;
        });
      }
      // Nominatim rate limit: 1 req/sec
      if (i < uncached.length - 1) await delay(1100);
    }
    setIsGeocoding(false);
  }, []);

  // Load courses when state is selected
  useEffect(() => {
    if (!selectedState) return;
    geocodeAbortRef.current = true; // abort any in-progress geocoding

    const loadCourses = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('Course_Database')
          .select('"Course Name", "Address", "Facility ID", "Phone", "Course Website"')
          .not('"Course Name"', 'is', null)
          .ilike('"Address"', `%${selectedState.name}%`);

        if (courseSearchTerm.trim()) {
          query = query.or(
            `"Course Name".ilike.%${courseSearchTerm.trim()}%,"Address".ilike.%${courseSearchTerm.trim()}%`
          );
        }

        const { data, error } = await query
          .order('"Course Name"')
          .limit(200);

        if (error) throw error;
        const courseData = (data as Course[]) || [];
        setCourses(courseData);
        geocodeCourses(courseData, selectedState);
      } catch (error) {
        console.error('Error loading courses:', error);
        setCourses([]);
        setGeocodedCourses([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadCourses();
  }, [selectedState, courseSearchTerm, geocodeCourses]);

  const handleStateSelect = (state: typeof US_STATES[0]) => {
    setSelectedState(state);
    setCourseSearchTerm('');
    setSelectedCourse(null);
  };

  const handleBack = () => {
    setSelectedState(null);
    setCourses([]);
    setGeocodedCourses([]);
    setCourseSearchTerm('');
    setSelectedCourse(null);
  };

  const handleCourseSelect = (course: GeocodedCourse) => {
    setSelectedCourse(course);
  };

  const handleMarkerClick = (course: GeocodedCourse) => {
    setSelectedCourse(course);
    // Scroll to the course in the list
    const element = document.getElementById(`course-${course["Facility ID"]}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleBookCourse = () => {
    if (selectedCourse && selectedState) {
      navigate('/booking', {
        state: {
          preselectedState: selectedState.name,
          preselectedCourse: selectedCourse["Course Name"],
          preselectedFacilityId: selectedCourse["Facility ID"],
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Golf Courses</h1>
          <p className="text-lg text-muted-foreground">
            {selectedState 
              ? `Explore golf courses in ${selectedState.name}` 
              : 'Select a state to view available golf courses'}
          </p>
        </div>

        {!selectedState ? (
          // State Selection View
          <Card className="max-w-2xl mx-auto golf-card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Select Your State
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search states..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <ScrollArea className="h-[400px] pr-4">
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
              </div>
            </CardContent>
          </Card>
        ) : (
          // Map View with Courses
          <div className="space-y-6">
            {/* Book button when course is selected */}
            {selectedCourse && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-primary">{selectedCourse["Course Name"]}</p>
                    {selectedCourse["Address"] && (
                      <p className="text-sm text-muted-foreground">{selectedCourse["Address"]}</p>
                    )}
                  </div>
                  <Button onClick={handleBookCourse} className="shrink-0 w-full sm:w-auto">
                    <Calendar className="mr-2 h-4 w-4" />
                    Book {selectedCourse["Course Name"].length > 20 
                      ? selectedCourse["Course Name"].substring(0, 20) + '...' 
                      : selectedCourse["Course Name"]}
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <Button variant="outline" onClick={handleBack} className="shrink-0">
                ← Back to States
              </Button>
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search courses..."
                  value={courseSearchTerm}
                  onChange={(e) => setCourseSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <span className="text-sm text-muted-foreground shrink-0">
                {isLoading ? 'Loading...' : isGeocoding ? `${courses.length} courses (locating pins...)` : `${courses.length} courses found`}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Map - Show first on mobile */}
              <Card className="lg:col-span-2 golf-card-shadow overflow-hidden order-first lg:order-last">
                <div className="h-[300px] sm:h-[400px] lg:h-[540px]">
                  <Suspense fallback={<MapLoader />}>
                    <CourseMap
                      center={[selectedState.lat, selectedState.lng]}
                      courses={geocodedCourses}
                      stateCode={selectedState.code}
                      selectedCourse={selectedCourse}
                      onMarkerClick={handleMarkerClick}
                    />
                  </Suspense>
                </div>
              </Card>

              {/* Course List */}
              <Card className="lg:col-span-1 golf-card-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Courses</CardTitle>
                </CardHeader>
              <CardContent className="p-0">
                  <ScrollArea className="h-[300px] sm:h-[400px] lg:h-[500px]" ref={courseListRef}>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="ml-2 text-muted-foreground">Loading courses...</span>
                      </div>
                    ) : courses.length === 0 ? (
                      <div className="text-center py-8 px-4 text-muted-foreground">
                        No courses found
                      </div>
                    ) : (
                      <div className="divide-y">
                        {geocodedCourses.map((course, index) => {
                          const isSelected = selectedCourse?.["Facility ID"] === course["Facility ID"];
                          return (
                            <button
                              type="button"
                              id={`course-${course["Facility ID"]}`}
                              key={`${course["Facility ID"]}-${index}`}
                              onClick={() => handleCourseSelect(course)}
                              className={`w-full text-left p-4 transition-colors ${
                                isSelected 
                                  ? 'bg-primary/10 border-l-4 border-primary' 
                                  : 'hover:bg-muted/50'
                              }`}
                            >
                              <p className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                                {course["Course Name"]}
                              </p>
                              {course["Address"] && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {course["Address"]}
                                </p>
                              )}
                              {course["Phone"] && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {course["Phone"]}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Courses;
