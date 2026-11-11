// The hunting grounds on the game's start screen (client/hunting/), in the order they are shown: two to a row.
// Grassland Marsh and Alpine Valley Stream are built; the others show their picture and details, and open when their
// map is made. open: true = "Go hunting" works (the id is the map's, shared/world.js). One spot per location for now
// (each map's first stand).
// name is also used in messages, e.g. "You’ve left Grassland Marsh." Pictures are in client/public/locations/.
export const LOCATIONS = [
  {
    id: 'yukon-mountain-valley',
    name: 'Mountain Valley',
    about:
      'A wide mountain valley under snow-capped peaks, with spruce on the slopes and willow flats along the valley floor. Long sightlines carry a call a long way, and a bull can come from any side.',
  },
  {
    id: 'old-burn-regrowth',
    name: 'Old Burn Regrowth',
    about:
      'An old forest fire, years on: standing dead timber over thick young growth. The new shoots are moose food, and the snags give a bull plenty of places to stand and watch.',
  },
  {
    id: 'red-pine-bowl-swamp',
    name: 'Red Pine Swamp',
    about:
      'A misty swamp in a bowl ringed with tall red pine. Mornings start in fog, and sound carries strangely across the still water.',
  },
  {
    id: 'deep-woods-gully',
    name: 'Maple Forest Gully',
    about:
      'A narrow trail down a gully through hardwoods in full autumn colour. Tight cover and short sightlines: you’ll hear a bull long before you see him.',
  },
  {
    id: 'the-marsh',
    name: 'Grassland Marsh',
    open: true,
    about:
      'An open boreal marsh ringed by spruce and golden poplar. Eight stands look out over the grass and timber edges. Bulls answer from far off, cows and calves feed in the open, and you’ll share the marsh with black bears, wolves and coyotes.',
  },
  {
    id: 'granite-ridge',
    name: 'Granite Ridge Point',
    about:
      'Bare granite ridges, jack pine and red blueberry barrens with long views over the lakes below. Wind is everything up here.',
  },
  {
    id: 'golden-tamarack-bog',
    name: 'Tamarack Bog',
    about:
      'A wide bog of tamarack turned gold in the fall, with soft ground and scattered islands of black spruce. Moose love it; walking it is hard work.',
  },
  {
    id: 'alpine-valley-stream',
    name: 'Alpine Valley Stream',
    open: true,
    about:
      'A wide alpine valley in fall colour under snow-capped peaks. Your stand sits high on a hillside, looking down in steps over red and gold tundra, a frosty meadow, willow thickets and spruce groves to a stream winding across the valley floor, and on down the valley to a river in the distance. Long sightlines: a bull can show up anywhere from a hundred yards to the far timber.',
  },
];
