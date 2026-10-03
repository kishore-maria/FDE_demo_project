const photo = (slug) => `https://i.pravatar.cc/150?u=${slug}`;

export const authors = [
  {
    slug: 'arjun-patel',
    name: 'Arjun Patel',
    bio: 'Arjun Patel is a productivity researcher and former software engineer from Pune. His work blends neuroscience with everyday habits to help readers do deep, meaningful work. He also writes about the questions that shape a good life.',
  },
  {
    slug: 'raj-patel',
    name: 'Raj Patel',
    bio: 'Raj Patel is an educator and learning strategist who has coached thousands of students and professionals. He believes anyone can master anything with the right mindset. When he is not teaching, he writes quiet, reflective poetry.',
  },
  {
    slug: 'james-wright',
    name: 'James Wright',
    bio: 'James Wright is a business coach and historian who writes about ambition, discipline and the long arc of human progress. His books are known for turning big ideas into practical steps.',
  },
  {
    slug: 'james-adams',
    name: 'James Adams',
    bio: 'James Adams writes atmospheric thrillers set in forgotten towns and half-remembered pasts. A former crime reporter, he brings a sharp eye for detail and a love of slow-burning suspense.',
  },
  {
    slug: 'jessica-martin',
    name: 'Jessica Martin',
    bio: 'Jessica Martin is a novelist and playwright whose stories explore love, loss and second chances. Her characters linger long after the final page.',
  },
  {
    slug: 'laura-mitchell',
    name: 'Laura Mitchell',
    bio: 'Laura Mitchell is an award-winning author of science fiction and fantasy. A physicist by training, she builds worlds where wonder and rigour sit side by side.',
  },
  {
    slug: 'daniel-reed',
    name: 'Daniel Reed',
    bio: 'Daniel Reed is a writer, minimalist, and productivity coach based in San Francisco. With a passion for intentional living, Daniel has dedicated his career to helping individuals simplify their lives — one habit, one space, and one thought at a time. He is the author of The Joy of Minimalism, an acclaimed guide to decluttering both physically and mentally. His other works include Less, But Better and The Focus Reset, which have helped thousands rethink consumerism, prioritize what truly matters, and build sustainable systems for personal growth.',
  },
  {
    slug: 'clara-nelson',
    name: 'Clara Nelson',
    bio: 'Clara Nelson writes chilling mysteries and graphic novels with a gothic edge. She lives in an old house that, she insists, has never disappeared.',
  },
  {
    slug: 'emily-parker',
    name: 'Emily Parker',
    bio: "Emily Parker is a children's and young-adult author whose stories celebrate courage, friendship and curiosity. She illustrates many of her own books.",
  },
  {
    slug: 'sophia-bennett',
    name: 'Sophia Bennett',
    bio: 'Sophia Bennett is a bestselling mystery writer known for intricate plots and unforgettable detectives. Her novels have been translated into twelve languages.',
  },
  {
    slug: 'meera-iyer',
    name: 'Meera Iyer',
    bio: 'Meera Iyer writes in English and Hindi about food, memory and the music of everyday life. Her cookbooks and poetry collections are loved across India.',
  },
  {
    slug: 'karthik-raman',
    name: 'Karthik Raman',
    bio: 'Karthik Raman is a science communicator and Tamil novelist from Chennai. He writes about the cosmos, the Western Ghats and the stories that connect them.',
  },
].map((author) => ({ ...author, photoUrl: photo(author.slug) }));
