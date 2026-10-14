-- Yappa: word meanings (GAMEPLAY_REDESIGN.md, phase 5).
--
-- A Knower stuck for what to say can tap the secret word to see what it means. Each word
-- gets a short, plain meaning; each round copies its word's meaning into round_secrets,
-- next to the target, so only that round's two Knowers can read it (the Guesser's RLS
-- returns no row).

alter table words add column if not exists meaning text not null default '';
alter table round_secrets add column if not exists meaning text not null default '';

update words w set meaning = v.meaning
from (values
  ('aardvark', 'An African animal with a long snout and long tongue that digs up and eats ants.'),
  ('abacus', 'A frame of sliding beads on rods, used for counting and doing sums.'),
  ('accordion', 'A squeezebox instrument you push and pull while pressing keys or buttons.'),
  ('airport', 'A place where planes take off and land, with check-in desks and gates.'),
  ('albatross', 'A huge white seabird with very long wings that glides over the ocean.'),
  ('amphitheater', 'An open-air arena with rows of seats in a circle or half circle around a stage.'),
  ('anchor', 'A heavy metal hook dropped from a boat on a chain to stop it drifting.'),
  ('anteater', 'A South American animal with a long nose and sticky tongue that eats ants.'),
  ('applesauce', 'A smooth, sweet mush made by cooking apples down.'),
  ('aquarium', 'A tank or a building full of fish and sea creatures you can look at.'),
  ('archery', 'The sport of shooting arrows from a bow at a round target.'),
  ('archipelago', 'A group or chain of islands close together in the sea.'),
  ('armadillo', 'A small animal with a hard, plated shell that can roll into a ball.'),
  ('artichoke', 'A green vegetable like a big flower bud; you eat the soft base of its leaves.'),
  ('asparagus', 'Long, thin green spears of vegetable, often served grilled with butter.'),
  ('avocado', 'A pear-shaped fruit with green, creamy flesh and a big stone, used in guacamole.'),
  ('axolotl', 'A pink or grey Mexican salamander that lives in water and seems to smile.'),
  ('backpack', 'A bag with two shoulder straps that you carry on your back.'),
  ('badminton', 'A racket sport where you hit a feathered shuttlecock over a high net.'),
  ('bagpipes', 'A Scottish instrument with a bag you blow into and pipes that drone.'),
  ('baguette', 'A long, thin French loaf of bread with a crunchy crust.'),
  ('bakery', 'A shop that makes and sells bread, cakes and pastries.'),
  ('balloon', 'A rubber bag you blow up with air or helium, seen at parties.'),
  ('baseball', 'A sport where you hit a ball with a bat and run around four bases.'),
  ('basketball', 'A sport where you bounce a ball and shoot it through a high hoop.'),
  ('beach', 'Sandy land by the sea where people swim, sunbathe and build sandcastles.'),
  ('bee', 'A small striped flying insect that makes honey and can sting.'),
  ('bicycle', 'A two-wheeled vehicle you ride by pushing pedals.'),
  ('binoculars', 'A pair of tubes you hold to both eyes to see faraway things up close.'),
  ('blanket', 'A large soft cover that keeps you warm in bed or on the sofa.'),
  ('blueberry', 'A small, round, dark blue berry, often in muffins and pancakes.'),
  ('boardwalk', 'A wooden path built along a beach or over wet ground.'),
  ('bobsledding', 'A winter sport where a team races a sled down a twisting ice track.'),
  ('bowling', 'A sport where you roll a heavy ball down a lane to knock over pins.'),
  ('boxing', 'A fighting sport where two people punch each other wearing padded gloves in a ring.'),
  ('bridge', 'A structure that lets you cross over a river, road or valley.'),
  ('broccoli', 'A green vegetable that looks like a little tree.'),
  ('broom', 'A brush on a long handle for sweeping the floor; witches fly on one.'),
  ('bucket', 'An open container with a handle for carrying water or sand.'),
  ('butterfly', 'An insect with big, colourful wings that starts life as a caterpillar.'),
  ('calendar', 'A chart of the days, weeks and months of the year.'),
  ('camera', 'A device for taking photos or videos.'),
  ('candle', 'A stick of wax with a wick that you light to give a small flame.'),
  ('canoeing', 'Paddling a narrow open boat along a river or lake.'),
  ('cantaloupe', 'A round melon with a rough skin and sweet orange flesh.'),
  ('canyon', 'A deep valley with steep rock sides, often with a river at the bottom.'),
  ('capybara', 'The world''s biggest rodent, a calm, furry South American animal that loves water.'),
  ('casserole', 'A dish of meat or vegetables slow-cooked together in the oven in one pot.'),
  ('castle', 'A big old stone building with towers and walls, where kings and knights lived.'),
  ('catacombs', 'Underground tunnels where people were buried long ago.'),
  ('cathedral', 'A very large, important church, often with tall towers and stained glass.'),
  ('cauliflower', 'A vegetable with a white, bumpy head surrounded by green leaves.'),
  ('cereal', 'Crunchy flakes or grains you eat from a bowl with milk for breakfast.'),
  ('chameleon', 'A lizard that changes colour and has eyes that move separately.'),
  ('chandelier', 'A fancy hanging light with many branches, bulbs or crystals.'),
  ('cheesecake', 'A rich dessert with a creamy filling on a biscuit base.'),
  ('chimpanzee', 'An ape from Africa, very clever and closely related to humans.'),
  ('chocolate', 'A sweet brown treat made from cocoa beans.'),
  ('cinema', 'A place where you watch films on a big screen.'),
  ('cinnamon', 'A sweet brown spice made from tree bark, used in buns and cakes.'),
  ('climbing', 'Going up rock faces or walls using your hands and feet.'),
  ('coconut', 'A big hard brown nut from a palm tree with white flesh and juice inside.'),
  ('coffee', 'A hot brown drink made from roasted beans that wakes you up.'),
  ('colosseum', 'The huge ancient arena in Rome where gladiators fought.'),
  ('compass', 'A tool with a needle that always points north, for finding your way.'),
  ('corkscrew', 'A twisty metal tool for pulling the stopper out of a wine bottle.'),
  ('cornbread', 'A yellow, crumbly bread made from corn meal.'),
  ('courtyard', 'An open space with no roof, surrounded by walls or buildings.'),
  ('cow', 'A big farm animal that gives milk and says moo.'),
  ('cricket', 'A bat-and-ball sport with wickets, very popular in England and India.'),
  ('crocodile', 'A big reptile with a long snout and sharp teeth that lives in rivers.'),
  ('croissant', 'A flaky, buttery French pastry with a crescent shape.'),
  ('cupcake', 'A small cake baked in a paper cup and topped with icing.'),
  ('curling', 'A winter sport where you slide heavy stones on ice and sweep in front of them.'),
  ('cycling', 'Riding a bike, as a sport or for fun.'),
  ('decathlon', 'A track and field contest made of ten different events.'),
  ('diving', 'Jumping into water head first, often from a high board, or swimming deep underwater.'),
  ('dodgeball', 'A team game where you throw balls at the other side and try not to get hit.'),
  ('dolphin', 'A smart, playful sea mammal that clicks, whistles and jumps out of the water.'),
  ('doughnut', 'A sweet fried ring of dough, often with icing or sprinkles.'),
  ('eggplant', 'A large purple vegetable with a shiny skin, also called aubergine.'),
  ('elephant', 'A huge grey animal with a trunk, big ears and tusks.'),
  ('enchilada', 'A Mexican dish of rolled tortillas filled and covered in sauce and cheese.'),
  ('farmhouse', 'The house where a farmer and their family live on a farm.'),
  ('fencing', 'A sport where two people fight with thin swords and wear masks.'),
  ('fjord', 'A long, narrow arm of the sea between tall cliffs, common in Norway.'),
  ('flamingo', 'A pink bird with long legs that often stands on one leg.'),
  ('flashlight', 'A small light you hold in your hand, powered by batteries; a torch.'),
  ('football', 'A team sport where you kick a ball into a goal; or the American game with an oval ball.'),
  ('fountain', 'A structure that shoots water up into the air, often in a park or square.'),
  ('gingerbread', 'A spiced cake or biscuit, often shaped like a little man or a house.'),
  ('giraffe', 'A very tall African animal with a long neck and spotted coat.'),
  ('glacier', 'A huge, slow-moving river of ice on mountains or near the poles.'),
  ('golf', 'A sport where you hit a small ball with clubs into holes in as few shots as you can.'),
  ('grapefruit', 'A big citrus fruit, sour and a bit bitter, with pink or yellow flesh.'),
  ('greenhouse', 'A glass building where plants are grown and kept warm.'),
  ('guacamole', 'A Mexican green dip made from mashed avocado.'),
  ('guitar', 'A string instrument you strum or pluck, with six strings and a long neck.'),
  ('gymnastics', 'A sport of flips, balance and strength on beams, bars, rings and mats.'),
  ('hamburger', 'A beef patty in a bun, often with cheese, lettuce and ketchup.'),
  ('hammer', 'A tool with a heavy head for banging in nails.'),
  ('handball', 'A team sport where you throw a ball into the other team''s goal with your hands.'),
  ('harbor', 'A sheltered spot by the shore where boats and ships stay safe.'),
  ('harmonica', 'A small mouth instrument you blow and suck air through.'),
  ('hedgehog', 'A small, prickly animal that rolls into a ball when scared.'),
  ('hippopotamus', 'A huge African animal that spends its day in rivers and has a giant mouth.'),
  ('hockey', 'A team sport played with sticks and a ball, or with a puck on ice.'),
  ('honeycomb', 'The wax shapes with six sides that bees build to store honey.'),
  ('hospital', 'A place where doctors and nurses treat sick or injured people.'),
  ('hourglass', 'Two glass bulbs joined in the middle with sand that runs through to measure time.'),
  ('hummingbird', 'A tiny bird that beats its wings so fast it can hover in the air.'),
  ('jellyfish', 'A soft, see-through sea creature with stinging tentacles.'),
  ('kaleidoscope', 'A tube you look into and turn to see colourful changing patterns.'),
  ('kangaroo', 'An Australian animal that hops and carries its baby in a pouch.'),
  ('karate', 'A Japanese martial art of punches, kicks and coloured belts.'),
  ('ketchup', 'A thick red tomato sauce, great with chips.'),
  ('keyboard', 'Rows of keys for typing on a computer, or the keys of a piano.'),
  ('kickboxing', 'A fighting sport that mixes punches and kicks.'),
  ('lacrosse', 'A team sport where you catch and throw a ball with a stick that has a net.'),
  ('ladder', 'Two long poles joined by steps that you climb to reach high places.'),
  ('lantern', 'A lamp in a case with a handle, for carrying a light around.'),
  ('lemonade', 'A sweet, sour drink made from lemons, sugar and water.'),
  ('library', 'A building full of books you can borrow and read.'),
  ('lighthouse', 'A tall tower by the sea with a bright light that warns ships.'),
  ('lion', 'A big wild cat from Africa; the male has a mane and is called king of the jungle.'),
  ('magnet', 'A piece of metal that pulls iron things toward it; sticks to the fridge.'),
  ('marathon', 'A running race of about 42 kilometres.'),
  ('marketplace', 'An open area where people set up stalls to buy and sell goods.'),
  ('marshmallow', 'A soft, squishy white sweet you can toast over a campfire.'),
  ('meatball', 'A small ball of minced meat, often served with spaghetti.'),
  ('meerkat', 'A small African animal that stands up on its back legs to keep watch.'),
  ('microscope', 'A science tool that makes tiny things look much bigger.'),
  ('microwave', 'A kitchen box that heats up food very quickly.'),
  ('milkshake', 'A cold, thick drink of milk and ice cream blended together.'),
  ('mirror', 'A shiny glass you look into to see yourself.'),
  ('monastery', 'A quiet place where monks live, work and pray together.'),
  ('museum', 'A building where old, rare or interesting things are shown to visitors.'),
  ('narwhal', 'An Arctic whale with one long, spiral tusk like a unicorn horn.'),
  ('necklace', 'Jewellery worn around the neck.'),
  ('observatory', 'A building with a big telescope for studying stars and planets.'),
  ('octopus', 'A sea creature with eight long arms and a soft body that squirts ink.'),
  ('orangutan', 'A big ape with long orange-red hair that lives in rainforest trees.'),
  ('orchard', 'A field of fruit trees, like apples or pears.'),
  ('otter', 'A playful, furry water animal that floats on its back.'),
  ('owl', 'A bird that hunts at night, with big eyes, that says hoot.'),
  ('paintball', 'A game where players shoot balls of paint at each other.'),
  ('pancake', 'A thin, flat cake cooked in a pan, often eaten with syrup.'),
  ('parachute', 'A big cloth canopy that opens to let you float down safely from a plane.'),
  ('parkour', 'Running through a city by jumping, climbing and vaulting over walls and rails.'),
  ('peacock', 'A bird whose male fans out a huge tail of colourful feathers with eye spots.'),
  ('pelican', 'A big water bird with a huge pouch under its beak for scooping fish.'),
  ('penguin', 'A black-and-white bird that can''t fly but swims, waddles and lives in cold places.'),
  ('peninsula', 'A piece of land almost surrounded by water but joined to the mainland.'),
  ('pepperoni', 'A spicy red sausage sliced thin and put on pizza.'),
  ('periscope', 'A long tube with mirrors that lets submarines see above the water.'),
  ('pillow', 'A soft cushion you rest your head on in bed.'),
  ('pineapple', 'A tropical fruit with spiky skin, a leafy top and sweet yellow flesh.'),
  ('pingpong', 'Table tennis: hitting a light ball over a small net on a table with paddles.'),
  ('pitchfork', 'A farm tool with a long handle and big prongs for lifting hay.'),
  ('pizza', 'A flat round bread baked with tomato sauce, cheese and toppings, cut into slices.'),
  ('planetarium', 'A theatre with a dome ceiling that shows the stars and planets.'),
  ('platypus', 'An Australian animal with a duck''s bill and beaver''s tail that lays eggs.'),
  ('playground', 'An outdoor area with swings and slides for children to play.'),
  ('popcorn', 'Puffed corn kernels eaten as a snack, especially at the movies.'),
  ('porcupine', 'An animal covered in long, sharp quills.'),
  ('powerlifting', 'A strength sport of lifting the heaviest weights possible in three lifts.'),
  ('prairie', 'A huge, flat grassland with few trees.'),
  ('pretzel', 'A baked snack twisted into a knot shape and sprinkled with salt.'),
  ('prison', 'A place where criminals are locked up.'),
  ('quesadilla', 'A Mexican tortilla folded around melted cheese and toasted.'),
  ('rabbit', 'A small furry animal with long ears that hops and loves carrots.'),
  ('raccoon', 'A grey animal with a striped tail and a black mask around its eyes.'),
  ('racetrack', 'A track where cars, horses or runners race around.'),
  ('rainforest', 'A thick, wet, tropical forest full of animals and plants.'),
  ('ratatouille', 'A French dish of stewed vegetables like courgette, aubergine and tomato.'),
  ('refrigerator', 'A cold box in the kitchen that keeps food fresh; the fridge.'),
  ('restaurant', 'A place where you sit down and pay to be served a meal.'),
  ('rhinoceros', 'A big, heavy animal with thick grey skin and a horn on its nose.'),
  ('rowing', 'Moving a boat with oars, often as a team race.'),
  ('rugby', 'A rough team sport with an oval ball that you carry and pass backwards.'),
  ('sailing', 'Moving a boat using wind in its sails.'),
  ('salamander', 'A small, slimy, lizard-like animal that lives near water.'),
  ('sandwich', 'Two slices of bread with a filling in between.'),
  ('savanna', 'Hot grassland with scattered trees, home to lions and zebras.'),
  ('saxophone', 'A curved brass instrument with keys, common in jazz.'),
  ('school', 'A place where children go to learn from teachers.'),
  ('scissors', 'A tool with two blades for cutting paper.'),
  ('scorpion', 'A creature with pincers and a curled tail that has a stinger.'),
  ('seahorse', 'A small fish that swims upright and has a head like a horse.'),
  ('shark', 'A big sea fish with sharp teeth and a fin that sticks out of the water.'),
  ('skateboarding', 'Riding and doing tricks on a small board with four wheels.'),
  ('skating', 'Gliding on ice with blades on your boots, or on wheels.'),
  ('skiing', 'Sliding down snowy mountains on two long planks with poles.'),
  ('skydiving', 'Jumping out of a plane and falling before opening a parachute.'),
  ('skyscraper', 'A very tall building with many floors in a city.'),
  ('smoothie', 'A thick, cold drink of blended fruit, sometimes with yogurt.'),
  ('snail', 'A slow, slimy creature that carries a spiral shell on its back.'),
  ('snorkeling', 'Swimming at the surface looking underwater through a mask and breathing tube.'),
  ('snowboarding', 'Sliding down a snowy slope standing sideways on one wide board.'),
  ('softball', 'A game like baseball with a bigger ball thrown underarm.'),
  ('spaghetti', 'Long, thin strings of pasta, often with tomato sauce.'),
  ('spider', 'A creature with eight legs that spins webs.'),
  ('squirrel', 'A small animal with a bushy tail that climbs trees and hides nuts.'),
  ('stadium', 'A huge arena with rows of seats around a field for sports or concerts.'),
  ('starfish', 'A sea creature shaped like a star with five arms.'),
  ('stethoscope', 'A tool doctors put in their ears to listen to your heartbeat.'),
  ('stingray', 'A flat sea fish shaped like a kite with a long, stinging tail.'),
  ('strawberry', 'A sweet red fruit with tiny seeds on the outside.'),
  ('suitcase', 'A case with a handle for carrying clothes when you travel.'),
  ('supermarket', 'A big shop where you buy food and groceries with a trolley.'),
  ('surfing', 'Riding ocean waves standing on a board.'),
  ('sushi', 'A Japanese dish of rice with raw fish, often rolled in seaweed.'),
  ('swimming', 'Moving through water using your arms and legs.'),
  ('taco', 'A Mexican folded tortilla with meat, cheese and salsa inside.'),
  ('taekwondo', 'A Korean martial art famous for high, fast kicks.'),
  ('tarantula', 'A big, hairy spider.'),
  ('telephone', 'A device you use to call and talk to people far away.'),
  ('telescope', 'A long tube with lenses for looking at stars and faraway things.'),
  ('television', 'A screen at home for watching shows and the news; the TV.'),
  ('tennis', 'A racket sport where you hit a fuzzy yellow ball over a net on a court.'),
  ('thermometer', 'A tool that measures temperature, such as when you have a fever.'),
  ('tiramisu', 'An Italian dessert of coffee-soaked biscuits and creamy layers dusted with cocoa.'),
  ('toothbrush', 'A small brush you use to clean your teeth.'),
  ('tortoise', 'A slow land animal with a big hard shell.'),
  ('toucan', 'A tropical bird with a huge, colourful beak.'),
  ('trampoline', 'A stretchy mat on springs that you bounce high on.'),
  ('trampolining', 'The sport of bouncing high and doing flips on a stretchy sprung mat.'),
  ('treehouse', 'A little hut built up in the branches for kids to play in.'),
  ('triathlon', 'A race where you swim, then cycle, then run.'),
  ('tundra', 'A cold, flat, treeless land near the Arctic where the ground stays frozen.'),
  ('typewriter', 'An old machine with keys that prints letters onto paper as you type.'),
  ('umbrella', 'A folding cover on a stick that keeps the rain off you.'),
  ('vineyard', 'A farm where grapes are grown, often to make wine.'),
  ('volcano', 'A mountain that can erupt with lava, ash and smoke.'),
  ('volleyball', 'A team sport where you hit a ball over a high net with your hands.'),
  ('waffle', 'A crispy batter cake with a grid pattern, often with syrup.'),
  ('warehouse', 'A huge building for storing goods before they''re sold or shipped.'),
  ('waterfall', 'Where a river drops over a cliff edge.'),
  ('watermelon', 'A big green fruit with juicy red flesh and black seeds.'),
  ('waterpolo', 'A team ball sport played in a swimming pool with goals at each end.'),
  ('weightlifting', 'Lifting a heavy barbell over your head as a sport.'),
  ('wheelbarrow', 'A small cart with one wheel and two handles for moving soil or bricks.'),
  ('wildebeest', 'A large African antelope with horns that migrates in huge herds; a gnu.'),
  ('windmill', 'A tall building with big sails that turn in the wind.'),
  ('woodpecker', 'A bird that taps holes in trees with its beak.'),
  ('wrestling', 'A sport where two people grapple and try to pin each other to the mat.'),
  ('wristwatch', 'A small clock you wear on a strap around your wrist.'),
  ('xylophone', 'An instrument of wooden or metal bars you hit with little hammers.'),
  ('zebra', 'An African horse-like animal with black and white stripes.'),
  ('zoo', 'A park where wild animals are kept so people can visit them.'),
  ('zucchini', 'A long green vegetable like a cucumber, also called courgette.')
) as v(id, meaning)
where w.id = v.id;

-- Replaces migration 014's version: also copies the word's meaning for the Knowers.
create or replace function _setup_round(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  deck_entry jsonb;
  play_order jsonb;
  guesser text;
  knowers text[];
  players jsonb;
  player_uid text;
  entry_id text;
begin
  select data into room_data from rooms where code = p_code for update;
  select words -> (p_round - 1) into deck_entry from game_decks where code = p_code;
  if deck_entry is null then
    raise exception 'no word drawn for room % round %', p_code, p_round;
  end if;
  entry_id := coalesce(deck_entry ->> 'id', (select w.id from words w where w.word = deck_entry ->> 'word'));

  play_order := room_data -> 'playerOrder';
  guesser := play_order ->> ((p_round - 1) % jsonb_array_length(play_order));
  select array_agg(uid order by ord) into knowers
  from jsonb_array_elements_text(play_order) with ordinality as t(uid, ord)
  where uid <> guesser;

  players := room_data -> 'players';
  for player_uid in select jsonb_object_keys(players) loop
    players := jsonb_set(
      players,
      array[player_uid, 'role'],
      to_jsonb(case when player_uid = guesser then 'guesser' else 'knower' end)
    );
  end loop;

  insert into round_secrets (code, round, target_word, guesser_uid, word_id, meaning)
  values (
    p_code, p_round, deck_entry ->> 'word', guesser, entry_id,
    coalesce((select w.meaning from words w where w.id = entry_id), '')
  )
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid,
        word_id = excluded.word_id, meaning = excluded.meaning;

  update rooms
  set data = (room_data - 'targetWord' - 'gameWords' - 'secondsRemaining' - 'linkChecks' - 'guessPending')
    || jsonb_build_object(
      'status', 'playing',
      'round', p_round,
      'category', deck_entry ->> 'category',
      'activeKnowerUid', case when p_round % 2 = 1 then knowers[1] else knowers[2] end,
      'guesserUid', guesser,
      'players', players,
      'chain', null,
      'feed', '[]'::jsonb,
      'turnIndex', 0,
      'typing', '{}'::jsonb
    )
  where code = p_code;
end;
$$;
