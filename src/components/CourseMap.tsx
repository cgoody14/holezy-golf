import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Create a custom golf pin icon
const golfPinIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Selected course icon (green)
const selectedPinIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface GeocodedCourse {
  "Course Name": string;
  "Address": string | null;
  "Facility ID": number;
  "Phone": string | null;
  "Course Website": string | null;
  lat: number;
  lng: number;
}

interface CourseMapProps {
  center: [number, number];
  courses: GeocodedCourse[];
  stateCode: string;
  selectedCourse: GeocodedCourse | null;
  onMarkerClick: (course: GeocodedCourse) => void;
}

// Component to handle map view changes
const MapController = ({ selectedCourse }: { selectedCourse: GeocodedCourse | null }) => {
  const map = useMap();
  
  useEffect(() => {
    if (selectedCourse) {
      map.flyTo([selectedCourse.lat, selectedCourse.lng], 10, { duration: 0.5 });
    }
  }, [selectedCourse, map]);
  
  return null;
};

const CourseMap = ({ center, courses, stateCode, selectedCourse, onMarkerClick }: CourseMapProps) => {
  return (
    <MapContainer
      center={center}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      key={stateCode}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController selectedCourse={selectedCourse} />
      {courses.map((course, index) => {
        const isSelected = selectedCourse?.["Facility ID"] === course["Facility ID"];
        return (
          <Marker
            key={`marker-${course["Facility ID"]}-${index}`}
            position={[course.lat, course.lng]}
            icon={isSelected ? selectedPinIcon : golfPinIcon}
            eventHandlers={{
              click: () => onMarkerClick(course),
            }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <p className="font-semibold">{course["Course Name"]}</p>
                {course["Address"] && (
                  <p className="text-sm mt-1" style={{ color: '#666' }}>{course["Address"]}</p>
                )}
                {course["Phone"] && (
                  <p className="text-sm mt-1">{course["Phone"]}</p>
                )}
                {course["Course Website"] && (
                  <a
                    href={course["Course Website"]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm mt-1 block"
                    style={{ color: '#16a34a' }}
                  >
                    Visit Website
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default CourseMap;
