import logoConcept1 from "@/assets/logo-concept-1-tech-ball.png";
import logoConcept2 from "@/assets/logo-concept-2-flag-hole.png";
import logoConcept3 from "@/assets/logo-concept-3-pin-marker.png";
import logoConcept4 from "@/assets/logo-concept-4-swing-motion.png";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-6xl w-full">
        <h1 className="text-4xl font-bold mb-2 text-center">Holezy Golf Logo Concepts</h1>
        <p className="text-muted-foreground text-center mb-12">Modern, Tech-Oriented Golf Icons</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col items-center p-8 border rounded-lg bg-card">
            <img src={logoConcept1} alt="Tech Golf Ball" className="w-64 h-64 object-contain mb-4" />
            <h3 className="text-xl font-semibold mb-2">Concept 1: Tech Golf Ball</h3>
            <p className="text-sm text-muted-foreground text-center">Geometric golf ball with circuit board patterns</p>
          </div>
          
          <div className="flex flex-col items-center p-8 border rounded-lg bg-card">
            <img src={logoConcept2} alt="Flag & Hole" className="w-64 h-64 object-contain mb-4" />
            <h3 className="text-xl font-semibold mb-2">Concept 2: Flag & Hole</h3>
            <p className="text-sm text-muted-foreground text-center">Abstract geometric golf flag and hole design</p>
          </div>
          
          <div className="flex flex-col items-center p-8 border rounded-lg bg-card">
            <img src={logoConcept3} alt="Location Pin Marker" className="w-64 h-64 object-contain mb-4" />
            <h3 className="text-xl font-semibold mb-2">Concept 3: Location Pin</h3>
            <p className="text-sm text-muted-foreground text-center">Location marker with golf ball integration</p>
          </div>
          
          <div className="flex flex-col items-center p-8 border rounded-lg bg-card">
            <img src={logoConcept4} alt="Golf Swing Motion" className="w-64 h-64 object-contain mb-4" />
            <h3 className="text-xl font-semibold mb-2">Concept 4: Swing Motion</h3>
            <p className="text-sm text-muted-foreground text-center">Abstract golf swing with flowing geometric lines</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
