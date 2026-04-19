import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, MapPin, X, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Course {
  "Course Name": string;
  "Address"?: string;
  "Facility ID"?: number;
  booking_platform?: string;
  platform_course_id?: string;
  platform_booking_url?: string;
}

interface CustomCourse {
  "Course Name": string;
  city: string;
  state: string;
}

interface CourseSelectorProps {
  selectedCourse: string;
  onCourseSelect: (courseName: string) => void;
  stateFilter?: string | null;
}

const CourseSelector = ({ selectedCourse, onCourseSelect, stateFilter }: CourseSelectorProps) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCourse, setCustomCourse] = useState<CustomCourse>({ "Course Name": '', city: '', state: '' });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { toast } = useToast();

  const pageSize = 50;

  const filteredCourses = useMemo(() => {
    if (!searchTerm.trim()) {
      return courses.slice(0, Math.min(15, courses.length));
    }
    return courses.filter(course =>
      course["Course Name"]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course["Address"]?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [courses, searchTerm]);

  useEffect(() => {
    const saved = localStorage.getItem('golfCourseSearches');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const loadCourses = useCallback(async (pageNum: number = 0, reset: boolean = false, searchQuery?: string) => {
    if (searchQuery) { setIsSearching(true); } else { setIsLoading(true); }

    try {
      const from = pageNum * pageSize;
      const to   = from + pageSize - 1;

      let query = supabase
        .from('Course_Database')
        .select('"Course Name", "Address", "Facility ID", booking_platform, platform_course_id, platform_booking_url')
        .not('"Course Name"', 'is', null);

      if (stateFilter) {
        query = query.or(
          `"Address".ilike.%, ${stateFilter}%,"Address".ilike.%, ${stateFilter} %,"Address".ilike.%${stateFilter},%`
        );
      }

      if (searchQuery && searchQuery.trim()) {
        query = query.or(
          `"Course Name".ilike.%${searchQuery.trim()}%,"Address".ilike.%${searchQuery.trim()}%`
        );
      }

      const { data, error } = await query.order('"Course Name"').range(from, to);
      if (error) throw error;

      if (reset) { setCourses(data || []); } else { setCourses(prev => [...prev, ...(data || [])]); }
      setHasMore((data || []).length === pageSize);
      setPage(pageNum);
    } catch (error) {
      console.error('Error loading courses:', error);
      toast({ title: "Error loading courses", description: "Please try again later", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, [toast, stateFilter]);

  useEffect(() => { loadCourses(0, true); }, [stateFilter]);

  const handleCourseSelect = (courseName: string, course?: Course) => {
    onCourseSelect(courseName);
    setSearchTerm(courseName);
    setShowCustomInput(false);

    if (course) {
      sessionStorage.setItem('selectedCourse', JSON.stringify({
        name:               course["Course Name"],
        facilityId:         course["Facility ID"],
        bookingPlatform:    course.booking_platform || 'chronogolf',
        platformCourseId:   course.platform_course_id || String(course["Facility ID"] || ''),
        platformBookingUrl: course.platform_booking_url || '',
      }));
    }

    const updated = [courseName, ...recentSearches.filter(s => s !== courseName)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('golfCourseSearches', JSON.stringify(updated));
    setIsOpen(false);
  };

  const openCustomForm = () => {
    setCustomCourse({ "Course Name": searchTerm, city: '', state: '' });
    setShowCustomInput(true);
    setIsOpen(false);
  };

  const handleCustomCourseSubmit = async () => {
    if (!customCourse["Course Name"].trim()) return;

    try {
      const { data: existingCourses, error: fetchError } = await supabase
        .from('Course_Database')
        .select('"Facility ID"')
        .gte('"Facility ID"', 900000)
        .order('"Facility ID"', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      let nextId = 900001;
      if (existingCourses && existingCourses.length > 0) {
        nextId = (existingCourses[0]["Facility ID"] || 900000) + 1;
      }

      const locationSuffix = customCourse.city
        ? ` (${customCourse.city}${customCourse.state ? ', ' + customCourse.state : ''})`
        : '';
      const customCourseName = `${customCourse["Course Name"].trim()}${locationSuffix}`;

      const { error: insertError } = await supabase
        .from('Course_Database')
        .insert({
          "Facility ID": nextId,
          "Course Name": customCourseName,
          "Address": customCourse.city
            ? `${customCourse.city}${customCourse.state ? ', ' + customCourse.state : ''}`
            : null,
          "Source": 'user_added'
        });

      if (insertError) throw insertError;

      try {
        await supabase.functions.invoke('send-admin-alert', {
          body: { type: 'course_added', courseDetails: { name: customCourse["Course Name"], city: customCourse.city, state: customCourse.state, facilityId: nextId } }
        });
      } catch { /* non-fatal */ }

      onCourseSelect(customCourseName);
      setSearchTerm(customCourseName);
      setShowCustomInput(false);
      setCustomCourse({ "Course Name": '', city: '', state: '' });
      loadCourses(0, true);
    } catch (error) {
      console.error('Error saving custom course:', error);
      toast({ title: "Error adding course", description: "Please try again", variant: "destructive" });
    }
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) loadCourses(page + 1, false, searchTerm);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setPage(0);
    setHasMore(true);
    loadCourses(0, true, value);
    if (!value.trim() && selectedCourse) onCourseSelect('');
    setShowCustomInput(false);
  };

  const clearSelection = () => {
    setSearchTerm('');
    onCourseSelect('');
    setShowCustomInput(false);
    loadCourses(0, true);
  };

  return (
    <div className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search golf courses by name or location..."
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={() => { setIsOpen(true); setShowCustomInput(false); }}
          className="pl-10 pr-20"
        />
        <div className="absolute right-1 top-1 flex items-center space-x-1">
          {selectedCourse && (
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={clearSelection} title="Clear selection">
              <X className="h-3 w-3" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsOpen(!isOpen)}>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {selectedCourse && !isOpen && (
          <div className="mt-2">
            <Badge variant="secondary" className="flex items-center space-x-1 w-fit">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{selectedCourse}</span>
            </Badge>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !showCustomInput && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-[85vh] overflow-hidden bg-background shadow-lg border">
          <CardContent className="p-0">
            <div className="max-h-[85vh] overflow-y-auto">

              {/* Pinned "Add your course" row — always at the top when searching */}
              {searchTerm.trim() && (
                <button
                  type="button"
                  className="w-full text-left p-3 bg-green-50 border-b-2 border-green-200 hover:bg-green-100 transition-colors focus:outline-none"
                  onClick={openCustomForm}
                >
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-green-700 shrink-0" />
                    <div>
                      <span className="font-medium text-green-800">Can't find it? Add </span>
                      <span className="font-semibold text-green-900">"{searchTerm}"</span>
                      <span className="font-medium text-green-800"> as your course</span>
                    </div>
                  </div>
                </button>
              )}

              {/* Search status */}
              <div className="p-3 text-xs text-muted-foreground bg-muted/30 border-b">
                {isSearching ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Searching courses...</span>
                  </div>
                ) : searchTerm ? (
                  `${filteredCourses.length} course${filteredCourses.length === 1 ? '' : 's'} found`
                ) : (
                  "Start typing to search, or scroll to browse all courses"
                )}
              </div>

              {/* Recent searches */}
              {!searchTerm && recentSearches.length > 0 && (
                <div className="p-3 border-b bg-muted/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-muted-foreground">Recent Searches</div>
                    <Button variant="ghost" size="sm" className="h-5 text-xs text-muted-foreground hover:text-destructive px-1" onClick={() => setRecentSearches([])}>
                      Clear
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recentSearches.map((recent, index) => (
                      <Button key={index} variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleCourseSelect(recent)}>
                        {recent}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Course list */}
              {(isLoading && courses.length === 0) || isSearching ? (
                <div className="p-6 text-center text-muted-foreground">
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading courses...</span>
                  </div>
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                  <div className="text-sm font-medium">No courses found</div>
                  <div className="text-xs text-muted-foreground/70 mt-1 mb-4">Use the button above to add your course</div>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredCourses.map((course, index) => (
                    <button
                      key={`${course["Facility ID"]}-${index}`}
                      type="button"
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors focus:bg-muted/50 focus:outline-none"
                      onClick={() => handleCourseSelect(course["Course Name"], course)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center space-x-2">
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{course["Course Name"]}</span>
                            {course.booking_platform && course.booking_platform !== 'chronogolf' && (
                              <span className="ml-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                                {course.booking_platform}
                              </span>
                            )}
                          </div>
                          {course["Address"] && (
                            <div className="text-sm text-muted-foreground mt-1 truncate">{course["Address"]}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}

                  {hasMore && searchTerm && (
                    <button
                      type="button"
                      className="w-full p-3 text-center text-sm text-primary hover:bg-muted/50 transition-colors disabled:opacity-50"
                      onClick={handleLoadMore}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center space-x-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Loading more...</span>
                        </div>
                      ) : 'Load more courses'}
                    </button>
                  )}
                </div>
              )}

              {/* Bottom "Add course" prompt when browsing (no search term) */}
              {!searchTerm && (
                <button
                  type="button"
                  className="w-full text-left p-3 bg-muted/20 border-t hover:bg-muted/40 transition-colors focus:outline-none"
                  onClick={openCustomForm}
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Can't find your course? Add it manually</span>
                  </div>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overlay to close dropdown */}
      {isOpen && !showCustomInput && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Persistent "Can't find it?" link below search when no course is selected */}
      {!selectedCourse && !isOpen && !showCustomInput && (
        <button
          type="button"
          className="mt-2 flex items-center gap-1 text-xs text-green-700 hover:text-green-900 hover:underline transition-colors"
          onClick={openCustomForm}
        >
          <Plus className="h-3 w-3" />
          Can't find your course? Add it here
        </button>
      )}

      {/* Inline custom course form */}
      {showCustomInput && (
        <Card className="mt-2 border-green-200 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-700" />
              <span className="text-sm font-semibold text-green-800">Add Your Course</span>
            </div>
            <div className="space-y-2">
              <Input
                placeholder="Golf course name *"
                value={customCourse["Course Name"]}
                onChange={(e) => setCustomCourse(prev => ({ ...prev, "Course Name": e.target.value }))}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City (optional)"
                  value={customCourse.city}
                  onChange={(e) => setCustomCourse(prev => ({ ...prev, city: e.target.value }))}
                />
                <Input
                  placeholder="State (optional)"
                  value={customCourse.state}
                  onChange={(e) => setCustomCourse(prev => ({ ...prev, state: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCustomCourseSubmit}
                size="sm"
                className="flex-1 bg-green-700 hover:bg-green-800 text-white"
                disabled={!customCourse["Course Name"].trim()}
              >
                Add Course
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowCustomInput(false); setCustomCourse({ "Course Name": '', city: '', state: '' }); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CourseSelector;
