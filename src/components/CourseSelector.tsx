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
  const { toast } = useToast();

  const pageSize = 50;

  // Filtered courses based on search term
  const filteredCourses = useMemo(() => {
    if (!searchTerm.trim()) return courses.slice(0, 10); // Show first 10 when no search
    
    return courses.filter(course =>
      course.course_name?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 10); // Show top 10 matching results
  }, [courses, searchTerm]);

  const loadCourses = async (pageNum: number = 0, reset: boolean = false) => {
    setIsLoading(true);
    try {
      const from = pageNum * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error } = await supabase
        .from('Course_Database')
        .select('course_name, address, facility_id')
        .not('course_name', 'is', null)
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
    onCourseSelect(courseName);
    setSearchTerm(courseName);
    setIsOpen(false);
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      loadCourses(page + 1, false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // Clear selection if search is cleared
    if (!value.trim() && selectedCourse) {
      onCourseSelect('');
    }
  };

  return (
    <div className="relative">
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

      {isOpen && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-80 overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
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
                  
                  {!searchTerm && hasMore && (
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