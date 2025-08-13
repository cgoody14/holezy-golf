import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, MapPin, X, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Course {
  course_name: string;
  address?: string;
  facility_id?: number;
}

interface CustomCourse {
  course_name: string;
  city: string;
  state: string;
}

interface CourseSelectorProps {
  selectedCourse: string;
  onCourseSelect: (courseName: string) => void;
}

const CourseSelector = ({ selectedCourse, onCourseSelect }: CourseSelectorProps) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCourse, setCustomCourse] = useState<CustomCourse>({ course_name: '', city: '', state: '' });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { toast } = useToast();

  const pageSize = 50;

  // Filtered courses based on search term
  const filteredCourses = useMemo(() => {
    if (!searchTerm.trim()) {
      const defaultCourses = courses.slice(0, Math.min(15, courses.length));
      return [...defaultCourses, { course_name: 'Other', address: 'Type in your course if not found above' }];
    }
    
    const filtered = courses.filter(course =>
      course.course_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.address?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Add "Other" option to filtered results
    return [...filtered, { course_name: 'Other', address: 'Type in your course if not found above' }];
  }, [courses, searchTerm]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('golfCourseSearches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading recent searches:', e);
      }
    }
  }, []);

  const loadCourses = useCallback(async (pageNum: number = 0, reset: boolean = false, searchQuery?: string) => {
    if (searchQuery) {
      setIsSearching(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const from = pageNum * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase
        .from('Course_Database')
        .select('course_name, address, facility_id')
        .not('course_name', 'is', null);
      
      // Enhanced search - search in both course name and address
      if (searchQuery && searchQuery.trim()) {
        query = query.or(
          `course_name.ilike.%${searchQuery.trim()}%,address.ilike.%${searchQuery.trim()}%`
        );
      }
      
      const { data, error } = await query
        .order('course_name')
        .range(from, to);

      if (error) throw error;

      if (reset) {
        setCourses(data || []);
      } else {
        setCourses(prev => [...prev, ...(data || [])]);
      }
      
      setHasMore((data || []).length === pageSize);
      setPage(pageNum);
    } catch (error) {
      console.error('Error loading courses:', error);
      toast({
        title: "Error loading courses",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCourses(0, true);
  }, []);

  const handleCourseSelect = (courseName: string) => {
    if (courseName === 'Other') {
      setShowCustomInput(true);
      setSearchTerm('');
    } else {
      onCourseSelect(courseName);
      setSearchTerm(courseName);
      setShowCustomInput(false);
      
      // Save to recent searches
      const updated = [courseName, ...recentSearches.filter(s => s !== courseName)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('golfCourseSearches', JSON.stringify(updated));
    }
    setIsOpen(false);
  };

  const handleCustomCourseSubmit = () => {
    if (customCourse.course_name && customCourse.city && customCourse.state) {
      const customCourseName = `${customCourse.course_name} (${customCourse.city}, ${customCourse.state})`;
      onCourseSelect(customCourseName);
      setSearchTerm(customCourseName);
      setShowCustomInput(false);
      setCustomCourse({ course_name: '', city: '', state: '' });
    }
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      loadCourses(page + 1, false, searchTerm);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // Reset pagination and load courses with search
    setPage(0);
    setHasMore(true);
    loadCourses(0, true, value);
    
    // Clear selection if search is cleared
    if (!value.trim() && selectedCourse) {
      onCourseSelect('');
    }
    
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
      {!showCustomInput ? (
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search golf courses by name or location..."
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => setIsOpen(true)}
            className="pl-10 pr-20"
          />
          <div className="absolute right-1 top-1 flex items-center space-x-1">
            {selectedCourse && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={clearSelection}
                title="Clear selection"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsOpen(!isOpen)}
            >
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
      ) : (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium text-muted-foreground">Enter your golf course details:</div>
          <div className="space-y-2">
            <Input
              placeholder="Golf course name"
              value={customCourse.course_name}
              onChange={(e) => setCustomCourse(prev => ({ ...prev, course_name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="City"
                value={customCourse.city}
                onChange={(e) => setCustomCourse(prev => ({ ...prev, city: e.target.value }))}
              />
              <Input
                placeholder="State"
                value={customCourse.state}
                onChange={(e) => setCustomCourse(prev => ({ ...prev, state: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex space-x-2">
            <Button onClick={handleCustomCourseSubmit} size="sm" className="flex-1">
              Add Course
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setShowCustomInput(false);
                setCustomCourse({ course_name: '', city: '', state: '' });
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isOpen && !showCustomInput && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-hidden bg-background shadow-lg border">
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {/* Search status and tips */}
              <div className="p-3 text-xs text-muted-foreground bg-muted/30 border-b">
                {isSearching ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Searching courses...</span>
                  </div>
                ) : searchTerm ? (
                  `${filteredCourses.length - 1} courses found`
                ) : (
                  "Can't find your course? Select \"Other\" to add it manually."
                )}
              </div>

              {/* Recent searches */}
              {!searchTerm && recentSearches.length > 0 && (
                <div className="p-3 border-b bg-muted/10">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Recent Searches</div>
                  <div className="flex flex-wrap gap-1">
                    {recentSearches.map((recent, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => handleCourseSelect(recent)}
                      >
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
              ) : filteredCourses.length === 1 && filteredCourses[0].course_name === 'Other' ? (
                <div className="p-6 text-center text-muted-foreground">
                  <div className="mb-3">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  </div>
                  <div className="text-sm">
                    {searchTerm ? 'No courses found matching your search' : 'No courses available'}
                  </div>
                  <div className="text-xs text-muted-foreground/70 mt-1">
                    Try a different search term or add your course manually
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredCourses.map((course, index) => (
                    <button
                      key={`${course.facility_id}-${index}`}
                      type="button"
                      className={`w-full text-left p-3 hover:bg-muted/50 transition-colors focus:bg-muted/50 focus:outline-none ${
                        course.course_name === 'Other' ? 'bg-primary/5 border-t-2 border-primary/20' : ''
                      }`}
                      onClick={() => handleCourseSelect(course.course_name)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center space-x-2">
                            {course.course_name === 'Other' ? (
                              <>
                                <Plus className="h-4 w-4 text-primary" />
                                <span className="text-primary">Add Custom Course</span>
                              </>
                            ) : (
                              <>
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate">{course.course_name}</span>
                              </>
                            )}
                          </div>
                          {course.address && (
                            <div className="text-sm text-muted-foreground mt-1 truncate">
                              {course.address}
                            </div>
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
                      ) : (
                        'Load more courses'
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default CourseSelector;