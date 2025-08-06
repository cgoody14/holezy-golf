import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCourse, setCustomCourse] = useState<CustomCourse>({ course_name: '', city: '', state: '' });
  const { toast } = useToast();

  const pageSize = 50;

  // Filtered courses based on search term
  const filteredCourses = useMemo(() => {
    if (!searchTerm.trim()) {
      const defaultCourses = courses.slice(0, Math.min(10, courses.length));
      return [...defaultCourses, { course_name: 'Other', address: 'Type in your course if not found above' }];
    }
    
    const filtered = courses.filter(course =>
      course.course_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Add "Other" option to filtered results
    return [...filtered, { course_name: 'Other', address: 'Type in your course if not found above' }];
  }, [courses, searchTerm]);

  const loadCourses = async (pageNum: number = 0, reset: boolean = false, searchQuery?: string) => {
    setIsLoading(true);
    try {
      const from = pageNum * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase
        .from('Course_Database')
        .select('course_name, address, facility_id')
        .not('course_name', 'is', null);
      
      // Add search filter if provided
      if (searchQuery && searchQuery.trim()) {
        query = query.ilike('course_name', `%${searchQuery.trim()}%`);
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
    }
  };

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

  return (
    <div className="relative">
      {!showCustomInput ? (
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search golf courses..."
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => setIsOpen(true)}
            className="pl-10 pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1 h-8 w-8 p-0"
            onClick={() => setIsOpen(!isOpen)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
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
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-80 overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              <div className="p-3 text-xs text-muted-foreground bg-muted/50 border-b">
                Can't find your course? Select "Other" to add it manually.
              </div>
              {isLoading && courses.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading courses...
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? 'No courses found matching your search' : 'No courses available'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredCourses.map((course, index) => (
                    <button
                      key={`${course.facility_id}-${index}`}
                      type="button"
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors focus:bg-muted/50 focus:outline-none"
                      onClick={() => handleCourseSelect(course.course_name)}
                    >
                      <div className="font-medium">{course.course_name}</div>
                      {course.address && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {course.address}
                        </div>
                      )}
                    </button>
                  ))}
                  
                  {hasMore && (
                    <button
                      type="button"
                      className="w-full p-3 text-center text-sm text-primary hover:bg-muted/50 transition-colors"
                      onClick={handleLoadMore}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Loading...' : 'Load more courses'}
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