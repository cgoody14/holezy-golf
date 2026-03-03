import { useState, useEffect, useMemo, lazy, Suspense, useRef, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Search, Loader2, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import SEOHead from '@/components/SEOHead';
import { getCityBySlug } from '@/data/seoContent';

const CourseMap = lazy(() => import('@/components/CourseMap'));

const GEOCODE_CACHE_KEY = 'holezy_geocode_cache';
const getGeocodeCache = (): Record<string, { lat: number; lng: number }> => {
  try { const c = localStorage.getItem(GEOCODE_CACHE_KEY); return c ? JSON.parse(c) : {}; } catch { return {}; }
};
const setGeocodeCache = (cache: Record<string, { lat: number; lng: number }>) => {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch {}
};
const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, { headers: { 'User-Agent': 'HolezyGolfApp/1.0' } });
    const d = await r.json();
    return d?.[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null;
  } catch { return null; }
};
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const seededRandom = (seed: number) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

interface Course { "Course Name": string; "Address": string | null; "Facility ID": number; "Phone": string | null; "Course Website": string | null; }
interface GeocodedCourse extends Course { lat: number; lng: number; }

const MapLoader = () => (
  <div className="h-full flex items-center justify-center bg-muted/20">
    <div className="text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
      <p className="text-muted-foreground">Loading map...</p>
    </div>
  </div>
);

const CityCourses = () => {
  const { stateSlug, citySlug } = useParams<{ stateSlug: string; citySlug: string }>();
  const navigate = useNavigate();
  const cityData = stateSlug && citySlug ? getCityBySlug(stateSlug, citySlug) : undefined;

  const [courses, setCourses] = useState<Course[]>([]);
  const [geocodedCourses, setGeocodedCourses] = useState<GeocodedCourse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [courseSearchTerm, setCourseSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<GeocodedCourse | null>(null);
  const geocodeAbortRef = useRef(false);

  const safeGeocodedCourses = useMemo(
    () => geocodedCourses.filter((c): c is GeocodedCourse => Boolean(c) && typeof c["Facility ID"] === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lng)),
    [geocodedCourses]
  );

  const geocodeCourses = useCallback(async (coursesToGeocode: Course[], lat: number, lng: number) => {
    const cache = getGeocodeCache();
    setIsGeocoding(true);
    geocodeAbortRef.current = false;
    const normalized = coursesToGeocode.filter((c): c is Course => Boolean(c) && typeof c["Facility ID"] === 'number');
    const initial: GeocodedCourse[] = normalized.map((course, index) => {
      const key = `${course["Facility ID"]}`;
      if (cache[key]) return { ...course, lat: cache[key].lat, lng: cache[key].lng };
      const seed = course["Facility ID"] || index;
      return { ...course, lat: lat + (seededRandom(seed) - 0.5) * 0.3, lng: lng + (seededRandom(seed + 1000) - 0.5) * 0.4 };
    });
    setGeocodedCourses(initial);
    const uncached = normalized.map((c, i) => ({ course: c, index: i })).filter(({ course }) => !cache[`${course["Facility ID"]}`] && course["Address"]);
    for (let i = 0; i < uncached.length; i++) {
      if (geocodeAbortRef.current) break;
      const { course, index } = uncached[i];
      const result = await geocodeAddress(course["Address"]!);
      if (result) {
        cache[`${course["Facility ID"]}`] = result;
        setGeocodeCache(cache);
        setGeocodedCourses(prev => { const u = [...prev]; if (!u[index]) return prev; u[index] = { ...u[index], lat: result.lat, lng: result.lng }; return u; });
      }
      if (i < uncached.length - 1) await delay(1100);
    }
    setIsGeocoding(false);
  }, []);

  useEffect(() => {
    if (!cityData) return;
    geocodeAbortRef.current = true;
    const load = async () => {
      setIsLoading(true);
      try {
        // For city pages, filter by state name in address (courses are in the state)
        let query = supabase.from('Course_Database').select('"Course Name", "Address", "Facility ID", "Phone", "Course Website"').not('"Course Name"', 'is', null).ilike('"Address"', `%${cityData.stateName}%`);
        if (courseSearchTerm.trim()) query = query.or(`"Course Name".ilike.%${courseSearchTerm.trim()}%,"Address".ilike.%${courseSearchTerm.trim()}%`);
        const { data, error } = await query.order('"Course Name"').limit(200);
        if (error) throw error;
        const cd = (data as Course[]) || [];
        setCourses(cd);
        geocodeCourses(cd, cityData.lat, cityData.lng);
      } catch (e) { console.error(e); setCourses([]); setGeocodedCourses([]); }
      finally { setIsLoading(false); }
    };
    load();
  }, [cityData, courseSearchTerm, geocodeCourses]);

  if (!cityData) {
    navigate('/courses', { replace: true });
    return null;
  }

  const handleMarkerClick = (course: GeocodedCourse) => {
    setSelectedCourse(course);
    document.getElementById(`course-${course["Facility ID"]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleBookCourse = () => {
    if (selectedCourse) {
      navigate('/booking', { state: { preselectedState: cityData.stateName, preselectedCourse: selectedCourse["Course Name"], preselectedFacilityId: selectedCourse["Facility ID"] } });
    }
  };

  const cityStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": cityData.h1,
    "description": cityData.metaDescription,
    "url": `https://holezygolf.com/golf-courses/${cityData.stateSlug}/${cityData.slug}`,
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://holezygolf.com" },
        { "@type": "ListItem", "position": 2, "name": cityData.stateName, "item": `https://holezygolf.com/golf-courses/${cityData.stateSlug}` },
        { "@type": "ListItem", "position": 3, "name": cityData.name, "item": `https://holezygolf.com/golf-courses/${cityData.stateSlug}/${cityData.slug}` }
      ]
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead
        title={cityData.metaTitle}
        description={cityData.metaDescription}
        canonicalUrl={`/golf-courses/${cityData.stateSlug}/${cityData.slug}`}
        structuredData={cityStructuredData}
      />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
            <li>/</li>
            <li><Link to="/courses" className="hover:text-primary transition-colors">Courses</Link></li>
            <li>/</li>
            <li><Link to={`/golf-courses/${cityData.stateSlug}`} className="hover:text-primary transition-colors">{cityData.stateName}</Link></li>
            <li>/</li>
            <li className="text-foreground font-medium">{cityData.name}</li>
          </ol>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold mb-4">{cityData.h1}</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Find and book tee times at top golf courses near {cityData.name}, {cityData.stateName}.
        </p>

        {/* Map + Course List */}
        <div className="space-y-6 mb-12">
          {selectedCourse && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-primary">{selectedCourse["Course Name"]}</p>
                  {selectedCourse["Address"] && <p className="text-sm text-muted-foreground">{selectedCourse["Address"]}</p>}
                </div>
                <Button onClick={handleBookCourse} className="shrink-0 w-full sm:w-auto">
                  <Calendar className="mr-2 h-4 w-4" />Book This Course
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <Button variant="outline" onClick={() => navigate(`/golf-courses/${cityData.stateSlug}`)} className="shrink-0">← Back to {cityData.stateName}</Button>
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="text" placeholder="Search courses..." value={courseSearchTerm} onChange={(e) => setCourseSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <span className="text-sm text-muted-foreground shrink-0">
              {isLoading ? 'Loading...' : isGeocoding ? `${courses.length} courses (locating pins...)` : `${courses.length} courses found`}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 golf-card-shadow overflow-hidden order-first lg:order-last">
              <div className="h-[300px] sm:h-[400px] lg:h-[540px]">
                <Suspense fallback={<MapLoader />}>
                  <CourseMap center={[cityData.lat, cityData.lng]} courses={safeGeocodedCourses} stateCode={cityData.stateCode} selectedCourse={selectedCourse} onMarkerClick={handleMarkerClick} />
                </Suspense>
              </div>
            </Card>
            <Card className="lg:col-span-1 golf-card-shadow">
              <CardHeader className="pb-2"><CardTitle className="text-lg">Courses near {cityData.name}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px] sm:h-[400px] lg:h-[500px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Loading courses...</span></div>
                  ) : courses.length === 0 ? (
                    <div className="text-center py-8 px-4 text-muted-foreground">No courses found</div>
                  ) : (
                    <div className="divide-y">
                      {safeGeocodedCourses.map((course, index) => {
                        const isSelected = selectedCourse?.["Facility ID"] === course["Facility ID"];
                        return (
                          <button type="button" id={`course-${course["Facility ID"]}`} key={`${course["Facility ID"]}-${index}`} onClick={() => setSelectedCourse(course)}
                            className={`w-full text-left p-4 transition-colors ${isSelected ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/50'}`}>
                            <p className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>{course["Course Name"]}</p>
                            {course["Address"] && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course["Address"]}</p>}
                            {course["Phone"] && <p className="text-xs text-muted-foreground mt-1">{course["Phone"]}</p>}
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

        {/* SEO Content */}
        <section className="prose prose-lg max-w-4xl mx-auto mb-12">
          {cityData.content.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-muted-foreground leading-relaxed mb-4">{paragraph}</p>
          ))}
        </section>

        {/* Internal Links */}
        <section className="max-w-4xl mx-auto mb-12">
          <h2 className="text-2xl font-bold mb-4">More Golf Resources</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Link to={`/golf-courses/${cityData.stateSlug}`} className="block p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <h3 className="font-semibold text-primary">All {cityData.stateName} Golf Courses</h3>
              <p className="text-sm text-muted-foreground mt-1">Browse every golf course across {cityData.stateName}.</p>
            </Link>
            <Link to="/book" className="block p-4 rounded-lg border bg-primary/5 border-primary/20 hover:bg-primary/10 transition-colors">
              <h3 className="font-semibold text-primary">Book a Tee Time</h3>
              <p className="text-sm text-muted-foreground mt-1">Let our AI concierge secure your next round near {cityData.name}.</p>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CityCourses;
