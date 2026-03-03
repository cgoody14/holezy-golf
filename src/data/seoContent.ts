// SEO content data for state and city pages

export interface StateSEOData {
  slug: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  content: string;
  cities: CitySEOData[];
}

export interface CitySEOData {
  slug: string;
  name: string;
  stateSlug: string;
  stateName: string;
  stateCode: string;
  lat: number;
  lng: number;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  content: string;
}

export const STATE_SEO_DATA: StateSEOData[] = [
  {
    slug: 'massachusetts',
    name: 'Massachusetts',
    code: 'MA',
    lat: 42.230171,
    lng: -71.530106,
    metaTitle: 'Best Golf Courses in Massachusetts | Book Tee Times | Holezy Golf',
    metaDescription: 'Explore top golf courses across Massachusetts. Compare tee times and secure prime rounds with Holezy Golf\'s AI concierge.',
    h1: 'Best Golf Courses in Massachusetts',
    content: `
Massachusetts is one of the most historically significant golf states in the United States, home to some of the oldest and most respected courses in the country. The game of golf has deep roots in the Bay State, with The Country Club in Brookline — established in 1882 — being one of the five founding members of the United States Golf Association. Today, Massachusetts boasts over 300 golf courses, ranging from elite private clubs to affordable municipal layouts that serve weekend golfers across the state.

The golf season in Massachusetts typically runs from April through November, with peak demand occurring between May and September. During these months, weekend tee times at popular public courses can be extremely difficult to secure, especially at well-known facilities in the Greater Boston area. Courses like Granite Links Golf Club, Pinehills Golf Club, and George Wright Golf Course see heavy demand from the state's passionate golf community.

Public golf accounts for roughly 60% of all courses in Massachusetts, making the sport relatively accessible compared to states with a higher ratio of private clubs. Municipal courses managed by cities and towns — such as Fresh Pond Golf Course in Cambridge and Ponkapoag Golf Course in Canton — offer some of the best value in the state, with green fees typically ranging from $30 to $65 for 18 holes. Semi-private and daily-fee courses generally charge between $50 and $120, depending on the time of year and day of the week.

Boston is the epicenter of golf demand in Massachusetts. The metro area's population of nearly five million creates intense competition for prime tee times, particularly on Saturday and Sunday mornings. Many golfers in the Boston area report spending significant time calling courses, refreshing booking websites, and trying to coordinate groups — a process that Holezy Golf's AI-powered concierge service is designed to eliminate.

The western part of the state offers a different experience, with scenic mountain courses in the Berkshires providing a more relaxed booking environment. Central Massachusetts is home to hidden gems like Sterling National Country Club and Wachusett Country Club, which offer excellent conditions without the booking pressure found closer to Boston.

Weather plays a major role in Massachusetts golf. The shoulder seasons — early spring and late fall — can offer excellent playing conditions and easier tee time availability, though temperatures can be unpredictable. Smart golfers know that booking tee times during these windows can yield both savings and better course access.

Whether you're a casual weekend player looking for a quick nine holes near Boston or planning a golf trip to the Cape Cod courses, securing your preferred tee time doesn't have to be stressful. Holezy Golf monitors availability across Massachusetts courses and handles the booking process so you can focus on your game.
    `.trim(),
    cities: [
      {
        slug: 'boston',
        name: 'Boston',
        stateSlug: 'massachusetts',
        stateName: 'Massachusetts',
        stateCode: 'MA',
        lat: 42.3601,
        lng: -71.0589,
        metaTitle: 'Best Golf Courses in Boston, Massachusetts | Tee Times | Holezy Golf',
        metaDescription: 'Find and book tee times at the best golf courses in Boston, Massachusetts. Secure hard-to-get weekend rounds with Holezy Golf.',
        h1: 'Best Golf Courses in Boston, Massachusetts',
        content: `
Boston's golf scene is as competitive as the city itself. With a metro population approaching five million people and a limited number of public and semi-private golf courses within a reasonable driving distance, securing a prime weekend tee time in Boston ranks among the most challenging booking tasks for any casual golfer in the northeastern United States.

The Greater Boston area is home to approximately 80 golf courses within a 30-mile radius of downtown, but a significant portion of those are private clubs with membership requirements. For public golfers, the realistic options narrow to around 30–40 courses, creating intense competition during peak season. Municipal courses operated by the City of Boston, such as George Wright Golf Course in Hyde Park and William J. Devine Golf Course in Franklin Park, offer green fees under $50 but are notoriously difficult to book on weekends.

Weekend demand in Boston peaks between 7:00 AM and 10:00 AM on Saturdays and Sundays from May through September. During this window, popular courses can fill their tee sheets within minutes of opening online bookings — often days in advance. Golfers who work traditional Monday-through-Friday schedules frequently find themselves shut out of their preferred times and courses.

Green fees in the Boston metro area vary significantly based on course type and location. Municipal courses typically range from $28 to $55 for 18 holes. Daily-fee courses such as Granite Links Golf Club in Quincy and Brookmeadow Country Club in Canton charge between $55 and $110 during peak hours. Premium public courses on the South Shore and along Route 495 can reach $90 to $150 during peak weekend times.

The Boston golf community is also shaped by its strong collegiate and corporate culture. Company outings, charity tournaments, and alumni events consume a meaningful share of available tee times, further tightening supply for individual players. Courses that accommodate group events may block off large sections of their tee sheet, reducing availability for walk-up or online bookings.

For golfers who commute from suburbs like Newton, Wellesley, Needham, or Braintree, the challenge of booking is compounded by the desire to avoid long drives before an early morning round. Courses closest to these high-income residential areas tend to have the strongest demand and earliest sell-out times.

Holezy Golf's AI-powered monitoring service was built for exactly this kind of market. By continuously scanning tee time availability across Boston-area courses, the service can identify open slots as they become available and secure bookings on your behalf. Instead of setting alarms, refreshing websites, or calling pro shops before they open, Boston golfers can simply tell Holezy when and where they want to play, and let the technology handle the rest.

The fall season — from late September through early November — offers an underappreciated window for Boston golf. Foliage season brings stunning course conditions and slightly reduced demand, making it an ideal time to explore courses you might otherwise struggle to book. Whether you're a Dorchester local looking for a quick weekday nine or a suburban golfer planning a Saturday foursome, Holezy Golf helps you spend less time booking and more time playing.
        `.trim()
      }
    ]
  },
  {
    slug: 'new-york',
    name: 'New York',
    code: 'NY',
    lat: 42.165726,
    lng: -74.948051,
    metaTitle: 'Best Golf Courses in New York | Book Tee Times | Holezy Golf',
    metaDescription: 'Explore top golf courses across New York. Compare tee times and secure prime rounds with Holezy Golf\'s AI concierge.',
    h1: 'Best Golf Courses in New York',
    content: `
New York State is one of the largest and most diverse golf markets in the United States, with over 800 golf courses spread across its 54,000 square miles. From the world-class private clubs of Westchester County to the scenic mountain courses in the Adirondacks, the Empire State offers golf experiences for every skill level and budget. However, the sheer population density — particularly in the New York City metropolitan area — creates some of the most competitive tee time booking conditions in the country.

The golf season in New York generally runs from mid-April through late October, though courses in the southern parts of the state and Long Island may extend play into November. Peak season arrives in June and runs through September, when weekend tee times at public courses become the hottest commodity in the state. During these months, popular courses can fill their Saturday and Sunday morning tee sheets within hours of becoming available.

New York's golf landscape is split between a large number of private clubs — particularly concentrated in the affluent suburbs surrounding New York City — and a strong network of public and semi-private courses. The state operates several well-regarded public facilities through its parks system, including Bethpage State Park on Long Island, which includes the famous Black Course that has hosted multiple U.S. Open Championships. Green fees at state-run courses are remarkably affordable for residents, typically ranging from $36 to $65, making them some of the best values in American golf.

The New York City metro area is the epicenter of booking pressure. With more than 20 million people living within commuting distance, the demand for accessible public golf far exceeds the available supply. Courses in Westchester, Nassau, Suffolk, and northern New Jersey all draw from the same massive population base, creating intense competition for tee times during weekends and holidays.

Upstate New York offers a dramatically different golf experience. The Finger Lakes region, the Hudson Valley, and the Catskill Mountains are home to dozens of excellent courses that operate in a much less pressured environment. Golfers willing to drive two to three hours from the city can find exceptional conditions, beautiful scenery, and much easier tee time availability. Courses like Leatherstocking Golf Course in Cooperstown and Turning Stone Resort in Verona offer resort-quality golf at a fraction of the cost found closer to the city.

Long Island represents a unique golf submarket within New York. Home to some of the most iconic courses in golf history — Shinnecock Hills, National Golf Links, and the Bethpage complex — the island also has a vibrant public golf scene. Courses like Eisenhower Park and Timber Point serve the daily-fee market, though weekend availability can be tight throughout the summer.

Whether you're competing for a Saturday morning slot at Bethpage or planning a golf weekend in the Hudson Valley, Holezy Golf's AI concierge service simplifies the booking process. Our technology monitors course availability across New York State and secures tee times on your behalf, eliminating the frustration of refreshing booking websites and calling pro shops.
    `.trim(),
    cities: [
      {
        slug: 'new-york-city',
        name: 'New York City',
        stateSlug: 'new-york',
        stateName: 'New York',
        stateCode: 'NY',
        lat: 40.7128,
        lng: -74.0060,
        metaTitle: 'Best Golf Courses in New York City, New York | Tee Times | Holezy Golf',
        metaDescription: 'Find and book tee times at the best golf courses in New York City, New York. Secure hard-to-get weekend rounds with Holezy Golf.',
        h1: 'Best Golf Courses in New York City, New York',
        content: `
Golf in New York City defies expectations. Despite being the most densely populated city in the United States, the five boroughs and their immediate surroundings offer a surprising number of golf courses — many of them public — that serve millions of residents who love the game. However, the math is simple and unforgiving: far more golfers want to play than the available tee times can accommodate, making NYC one of the most competitive golf booking markets in the world.

Within the five boroughs, the city operates 13 public golf courses through the NYC Parks Department. These courses — including Dyker Beach in Brooklyn, Pelham Bay and Split Rock in the Bronx, La Tourette and Silver Lake on Staten Island, Kissena in Queens, and the Clearview and Douglaston courses — provide remarkably affordable golf, with green fees typically ranging from $22 to $47 for city residents. For the price of a lunch in Manhattan, you can play a full 18 holes with skyline views that no other city in the world can match.

But affordability comes with a cost: availability. NYC municipal courses collectively serve a population of over 8 million people, and tee times during peak weekend hours — particularly between 6:30 AM and 10:00 AM on Saturdays and Sundays from May through September — are extraordinarily difficult to secure. The NYC Parks automated booking system often experiences high traffic volumes, and prime slots can disappear within minutes of opening.

Beyond the city limits, Long Island offers the next tier of options for NYC golfers. Bethpage State Park, located about 40 miles east of Manhattan in Farmingdale, is home to five courses, including the legendary Black Course that hosted the U.S. Open in 2002, 2009, and 2024. The Green, Blue, Yellow, and Red courses at Bethpage provide more accessible alternatives, though even these can be challenging to book on weekends. New York State residents enjoy discounted green fees, but non-residents pay a premium.

Westchester County, directly north of the city, has one of the highest concentrations of golf courses per capita in the United States. While many are private, several excellent daily-fee and semi-private options exist, including Maple Moor, Saxon Woods, and Dunwoodie — all county-operated courses with green fees between $35 and $70. These courses see heavy demand from both Westchester residents and city golfers escaping north for a round.

Northern New Jersey rounds out the NYC golf landscape. Courses like Crystal Springs, Neshanic Valley, and Hominy Hill offer exceptional quality within 60–90 minutes of Manhattan, though bridge and tunnel traffic can add significant travel time during peak hours.

The average weekend golfer in New York City faces a booking environment unlike any other in the country. Between limited supply, enormous demand, booking system bottlenecks, and competition from tournaments and outings, getting the tee time you want often requires planning days or weeks in advance. This is precisely why Holezy Golf exists.

Our AI-powered concierge service monitors tee time availability across NYC-area courses in real time, identifying open slots the moment they become available. Whether you want a 7 AM slot at Dyker Beach, a Saturday afternoon at Bethpage Green, or a weekday round in Westchester, Holezy Golf handles the booking so you don't have to fight the system. At just $5 per player, it's the easiest way to get on the course in the world's most competitive golf market.
        `.trim()
      }
    ]
  },
  {
    slug: 'illinois',
    name: 'Illinois',
    code: 'IL',
    lat: 40.349457,
    lng: -88.986137,
    metaTitle: 'Best Golf Courses in Illinois | Book Tee Times | Holezy Golf',
    metaDescription: 'Explore top golf courses across Illinois. Compare tee times and secure prime rounds with Holezy Golf\'s AI concierge.',
    h1: 'Best Golf Courses in Illinois',
    content: `
Illinois is one of the most vibrant golf states in the Midwest, combining a deep love for the sport with a diverse landscape that supports hundreds of courses from the shores of Lake Michigan to the rolling farmland of the southern counties. With approximately 650 golf courses statewide, Illinois ranks among the top ten states in the nation for total number of facilities, and its public golf infrastructure is particularly strong.

The golf season in Illinois typically runs from early April through late October, with peak demand concentrated between May and September. The state's continental climate means hot summers and crisp fall playing conditions, both of which drive high demand for weekend tee times. Unlike Sun Belt states that see year-round play, Illinois golfers pack their rounds into a relatively short window, creating intense booking competition during the warmer months.

The Chicago metropolitan area dominates the state's golf landscape, both in terms of course supply and player demand. The Chicagoland region — encompassing Cook, DuPage, Lake, Will, and Kane counties — is home to more than 200 golf courses, including a robust network of forest preserve and park district courses that provide exceptional value for public golfers. Facilities like Cog Hill Golf & Country Club in Lemont, which hosted the PGA Tour's BMW Championship for years, showcase the caliber of public golf available in the Chicago suburbs.

Public golf is the backbone of the Illinois market. Approximately 70% of courses in the state are open to daily-fee players, and municipal courses operated by park districts and forest preserves offer some of the most affordable green fees in the country. A round at a forest preserve course might cost $25 to $45, while premium daily-fee courses in the suburbs can range from $60 to $130 depending on the day and season.

Outside of Chicago, Illinois offers underappreciated golf destinations. The Quad Cities area along the Mississippi River, the university towns of Champaign-Urbana and Bloomington-Normal, and the state capital region around Springfield all have strong local golf scenes with less booking pressure than the metro area. Golfers willing to explore beyond Chicagoland will find excellent conditions and easier tee time availability.

The competitive booking environment in metropolitan Chicago mirrors what golfers experience in other major cities like Boston and New York. Weekend morning tee times at popular courses can fill up days in advance, and golfers who don't plan ahead often find themselves playing at inconvenient times or driving to less familiar courses. This is where Holezy Golf makes a difference — our AI concierge monitors availability across Illinois courses and secures your preferred tee times automatically.

Whether you're battling for a Saturday slot at a Chicago forest preserve course or planning a golf trip to the scenic courses of Galena, Holezy Golf simplifies the entire booking experience. Tell us when and where you want to play, and we'll handle the rest.
    `.trim(),
    cities: [
      {
        slug: 'chicago',
        name: 'Chicago',
        stateSlug: 'illinois',
        stateName: 'Illinois',
        stateCode: 'IL',
        lat: 41.8781,
        lng: -87.6298,
        metaTitle: 'Best Golf Courses in Chicago, Illinois | Tee Times | Holezy Golf',
        metaDescription: 'Find and book tee times at the best golf courses in Chicago, Illinois. Secure hard-to-get weekend rounds with Holezy Golf.',
        h1: 'Best Golf Courses in Chicago, Illinois',
        content: `
Chicago is one of America's great golf cities, a distinction earned through decades of investment in public golf infrastructure and a passionate player base that fills courses throughout the Midwest's compressed golf season. The Greater Chicago area is home to more than 200 golf courses, and the region's park districts and forest preserves operate some of the finest public golf facilities in the United States.

The Cook County Forest Preserve District alone manages nine golf courses, including well-regarded layouts like Billy Caldwell, Edgebrook, and Indian Boundary. These courses offer green fees typically ranging from $25 to $40 for 18 holes — remarkable value for a major metropolitan area. The Chicago Park District operates additional courses within the city limits, including the historic facilities at Jackson Park and Columbus Park, which have served Chicago golfers for generations.

Suburban Chicago takes public golf to another level. Cog Hill Golf & Country Club in Lemont, with its four courses including the championship Dubsdread layout, has long been considered one of the premier public golf destinations in the country. Cantigny Golf in Wheaton, operated by the McCormick Foundation, offers pristine conditions and a 27-hole layout that draws golfers from across the region. Other standout facilities include Harborside International on the city's South Side, Orchard Valley in Aurora, and Mistwood Golf Club in Romeoville.

Weekend tee time demand in Chicago is driven by the metro area's population of nearly 10 million people, combined with a golf season that runs only about seven months. From May through September, Saturday and Sunday morning tee times at popular courses are among the most sought-after commodities in Midwest golf. Courses like Harborside International — one of the few courses accessible directly from downtown Chicago — can fill their peak-time tee sheets within hours of becoming available.

Green fees across the Chicago market span a wide range. Municipal and forest preserve courses start as low as $20 for residents. Mid-tier daily-fee courses in the suburbs typically charge $50 to $90 for weekend 18-hole rounds. Premium public courses like Cog Hill Dubsdread, Cantigny, and Mistwood can reach $100 to $150 during peak times, though they often offer twilight and weekday discounts that bring the price down significantly.

One unique aspect of Chicago golf is the influence of weather on booking patterns. The city's notorious spring weather — featuring late cold snaps and April rain — means that the first few weeks of truly warm weather in May often see an explosion of booking demand as golfers who have been waiting all winter rush to get on the course. Similarly, September and October offer spectacular fall golf with cooler temperatures and stunning foliage, but the window is short, and golfers scramble to fit in as many rounds as possible before courses close for winter.

The corporate and social golf scene in Chicago also impacts tee time availability. The city's large corporate sector generates significant demand for company outings, client golf events, and charity tournaments, which can block large sections of tee sheets at popular courses. Individual players looking for prime weekend times often find themselves competing not just against other individuals but against group bookings that consume multiple consecutive slots.

For Chicago golfers tired of the booking battle, Holezy Golf offers a straightforward solution. Our AI-powered concierge monitors tee time availability across Chicago-area courses and secures bookings on your behalf. Whether you're looking for an early morning slot at a forest preserve course or a premium weekend round at one of the suburbs' top facilities, Holezy Golf handles the logistics so you can focus on your game. At just $5 per player, it's the simplest way to book golf in one of America's most competitive markets.
        `.trim()
      }
    ]
  }
];

export const getStateBySlug = (slug: string): StateSEOData | undefined =>
  STATE_SEO_DATA.find(s => s.slug === slug);

export const getCityBySlug = (stateSlug: string, citySlug: string): CitySEOData | undefined => {
  const state = getStateBySlug(stateSlug);
  return state?.cities.find(c => c.slug === citySlug);
};

// Map from state name to slug for redirects
export const STATE_NAME_TO_SLUG: Record<string, string> = {
  'Massachusetts': 'massachusetts',
  'New York': 'new-york',
  'Illinois': 'illinois',
};

export const SLUG_TO_STATE_NAME: Record<string, string> = {
  'massachusetts': 'Massachusetts',
  'new-york': 'New York',
  'illinois': 'Illinois',
};
