/**
 * Lecciones de inglés incluidas (funcionan sin conexión).
 * Cada una sigue el ciclo Learn → Practice → Listen → Speak → Review.
 * Con la IA activa se pueden generar lecciones nuevas sobre cualquier tema con el mismo formato.
 */
import type { CefrLevel } from '@/types';

export interface VocabItem { en: string; es: string; example: string }
export interface GrammarExercise { prompt: string; options: string[]; answer: string }
export interface Lesson {
  id: string;
  level: CefrLevel;
  title: string;
  topic: string;
  minutes: number;
  vocab: VocabItem[];
  grammar: { title: string; explain: string; examples: { en: string; es: string }[]; exercises: GrammarExercise[] };
  dialogue: { speaker: 'A' | 'B'; en: string; es: string }[];
  questions: { q: string; options: string[]; answer: number }[];
  speak: { en: string; es: string }[];
}

export const LEVELS: { id: CefrLevel; label: string; detail: string }[] = [
  { id: 'A1', label: 'A1 · Beginner', detail: 'Frases básicas y presentaciones' },
  { id: 'A2', label: 'A2 · Elementary', detail: 'Situaciones cotidianas y pasado simple' },
  { id: 'B1', label: 'B1 · Intermediate', detail: 'Opiniones, planes y experiencias' },
  { id: 'B2', label: 'B2 · Upper-intermediate', detail: 'Matices, argumentos y fluidez' },
];

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------ A1
  {
    id: 'a1-introductions', level: 'A1', title: 'Presentarte', topic: 'Introductions', minutes: 6,
    vocab: [
      { en: 'name', es: 'nombre', example: 'My name is Franco.' },
      { en: 'nice to meet you', es: 'encantado de conocerte', example: 'Hi, Anna. Nice to meet you.' },
      { en: 'where are you from?', es: '¿de dónde sos?', example: 'Where are you from? — I’m from Argentina.' },
      { en: 'job', es: 'trabajo', example: 'What’s your job?' },
      { en: 'live', es: 'vivir', example: 'I live in Buenos Aires.' },
      { en: 'work', es: 'trabajar', example: 'I work in design.' },
      { en: 'city', es: 'ciudad', example: 'It’s a big city.' },
      { en: 'married', es: 'casado/a', example: 'Are you married?' },
    ],
    grammar: {
      title: 'Verbo to be (am / is / are)',
      explain: 'Usamos «to be» para decir quiénes somos, de dónde somos y cómo estamos. I → am, he/she/it → is, you/we/they → are.',
      examples: [{ en: 'I am a designer.', es: 'Soy diseñador.' }, { en: 'She is from Chile.', es: 'Ella es de Chile.' }, { en: 'We are friends.', es: 'Somos amigos.' }],
      exercises: [
        { prompt: 'I ___ from Argentina.', options: ['am', 'is', 'are'], answer: 'am' },
        { prompt: 'They ___ my colleagues.', options: ['am', 'is', 'are'], answer: 'are' },
        { prompt: 'My sister ___ a teacher.', options: ['am', 'is', 'are'], answer: 'is' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Hi! I’m Anna. What’s your name?', es: '¡Hola! Soy Anna. ¿Cómo te llamás?' },
      { speaker: 'B', en: 'Hi, Anna. I’m Franco. Nice to meet you.', es: 'Hola, Anna. Soy Franco. Encantado.' },
      { speaker: 'A', en: 'Nice to meet you too. Where are you from?', es: 'Igualmente. ¿De dónde sos?' },
      { speaker: 'B', en: 'I’m from Argentina. I live in Buenos Aires.', es: 'Soy de Argentina. Vivo en Buenos Aires.' },
      { speaker: 'A', en: 'Cool! What do you do?', es: '¡Qué bueno! ¿A qué te dedicás?' },
      { speaker: 'B', en: 'I have a small company. And you?', es: 'Tengo una empresa chica. ¿Y vos?' },
      { speaker: 'A', en: 'I’m a nurse. I work at a hospital.', es: 'Soy enfermera. Trabajo en un hospital.' },
    ],
    questions: [
      { q: 'Where does Franco live?', options: ['In Chile', 'In Buenos Aires', 'In a hospital'], answer: 1 },
      { q: 'What is Anna’s job?', options: ['Designer', 'Teacher', 'Nurse'], answer: 2 },
    ],
    speak: [
      { en: 'My name is Franco and I live in Buenos Aires.', es: 'Me llamo Franco y vivo en Buenos Aires.' },
      { en: 'Nice to meet you.', es: 'Encantado de conocerte.' },
      { en: 'I have a small company.', es: 'Tengo una empresa chica.' },
    ],
  },
  {
    id: 'a1-ordering-food', level: 'A1', title: 'Pedir comida', topic: 'Ordering food', minutes: 7,
    vocab: [
      { en: 'menu', es: 'carta, menú', example: 'Can I see the menu, please?' },
      { en: 'I’d like…', es: 'quisiera…', example: 'I’d like a coffee, please.' },
      { en: 'water', es: 'agua', example: 'A bottle of water, please.' },
      { en: 'the bill', es: 'la cuenta', example: 'Can we have the bill?' },
      { en: 'dessert', es: 'postre', example: 'Would you like dessert?' },
      { en: 'to go', es: 'para llevar', example: 'A sandwich to go, please.' },
      { en: 'without', es: 'sin', example: 'A salad without onion.' },
      { en: 'delicious', es: 'delicioso', example: 'The pasta is delicious.' },
    ],
    grammar: {
      title: 'Pedidos amables: I’d like / Can I have…?',
      explain: '«I’d like» (= I would like) y «Can I have…?» son las formas educadas de pedir. «I want» suena brusco en un restaurante.',
      examples: [{ en: 'I’d like the chicken, please.', es: 'Quisiera el pollo, por favor.' }, { en: 'Can I have some water?', es: '¿Me das un poco de agua?' }],
      exercises: [
        { prompt: '___ like a green tea, please.', options: ['I’d', 'I', 'I’m'], answer: 'I’d' },
        { prompt: 'Can I ___ the bill, please?', options: ['have', 'has', 'having'], answer: 'have' },
        { prompt: 'A burger ___ cheese, please. (sin queso)', options: ['with', 'without', 'and'], answer: 'without' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Good evening. Are you ready to order?', es: 'Buenas noches. ¿Listos para pedir?' },
      { speaker: 'B', en: 'Yes. I’d like the vegetable soup, please.', es: 'Sí. Quisiera la sopa de verduras, por favor.' },
      { speaker: 'A', en: 'Of course. Anything to drink?', es: 'Claro. ¿Algo para tomar?' },
      { speaker: 'B', en: 'Just water, please. Sparkling.', es: 'Solo agua, por favor. Con gas.' },
      { speaker: 'A', en: 'Would you like dessert later?', es: '¿Va a querer postre después?' },
      { speaker: 'B', en: 'Maybe. Can I see the dessert menu?', es: 'Tal vez. ¿Puedo ver la carta de postres?' },
      { speaker: 'A', en: 'Sure, here you are.', es: 'Claro, aquí tiene.' },
    ],
    questions: [
      { q: 'What does the customer order?', options: ['Vegetable soup', 'Chicken', 'A burger'], answer: 0 },
      { q: 'What does the customer drink?', options: ['Still water', 'Sparkling water', 'Coffee'], answer: 1 },
    ],
    speak: [
      { en: 'I’d like the vegetable soup, please.', es: 'Quisiera la sopa de verduras, por favor.' },
      { en: 'Can we have the bill, please?', es: '¿Nos trae la cuenta, por favor?' },
      { en: 'A coffee to go, please.', es: 'Un café para llevar, por favor.' },
    ],
  },
  {
    id: 'a1-daily-routine', level: 'A1', title: 'Tu rutina diaria', topic: 'Daily routine', minutes: 6,
    vocab: [
      { en: 'wake up', es: 'despertarse', example: 'I wake up at seven.' },
      { en: 'have breakfast', es: 'desayunar', example: 'I have breakfast at home.' },
      { en: 'go to work', es: 'ir a trabajar', example: 'I go to work by bike.' },
      { en: 'usually', es: 'normalmente', example: 'I usually cook dinner.' },
      { en: 'never', es: 'nunca', example: 'I never drink coffee at night.' },
      { en: 'in the afternoon', es: 'a la tarde', example: 'I go to the gym in the afternoon.' },
      { en: 'go to bed', es: 'irse a dormir', example: 'I go to bed at eleven.' },
      { en: 'early', es: 'temprano', example: 'She gets up early.' },
    ],
    grammar: {
      title: 'Presente simple (he/she + -s)',
      explain: 'Para hábitos usamos el presente simple. Con he, she e it el verbo lleva -s: I work → she works; I go → he goes.',
      examples: [{ en: 'I read before bed.', es: 'Leo antes de dormir.' }, { en: 'He works from home.', es: 'Él trabaja desde casa.' }],
      exercises: [
        { prompt: 'She ___ up at six.', options: ['wake', 'wakes', 'waking'], answer: 'wakes' },
        { prompt: 'I ___ to the gym on Mondays.', options: ['go', 'goes', 'going'], answer: 'go' },
        { prompt: 'My brother ___ coffee. (nunca)', options: ['never drinks', 'drinks never', 'never drink'], answer: 'never drinks' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'What time do you usually wake up?', es: '¿A qué hora te despertás normalmente?' },
      { speaker: 'B', en: 'At half past six. I have breakfast and read a little.', es: 'A las seis y media. Desayuno y leo un poco.' },
      { speaker: 'A', en: 'Wow, early! Do you go to the office?', es: '¡Uy, temprano! ¿Vas a la oficina?' },
      { speaker: 'B', en: 'Three days a week. On the other days I work from home.', es: 'Tres días por semana. Los otros trabajo desde casa.' },
      { speaker: 'A', en: 'And in the afternoon?', es: '¿Y a la tarde?' },
      { speaker: 'B', en: 'I go to the gym, then I cook dinner.', es: 'Voy al gimnasio y después cocino.' },
    ],
    questions: [
      { q: 'When does B wake up?', options: ['6:00', '6:30', '7:30'], answer: 1 },
      { q: 'How many days does B go to the office?', options: ['Two', 'Three', 'Five'], answer: 1 },
    ],
    speak: [
      { en: 'I usually wake up at seven.', es: 'Normalmente me despierto a las siete.' },
      { en: 'I go to the gym in the afternoon.', es: 'Voy al gimnasio a la tarde.' },
      { en: 'I never check my phone in bed.', es: 'Nunca miro el teléfono en la cama.' },
    ],
  },
  {
    id: 'a1-time-numbers', level: 'A1', title: 'La hora y los números', topic: 'Time and numbers', minutes: 5,
    vocab: [
      { en: 'o’clock', es: 'en punto', example: 'It’s three o’clock.' },
      { en: 'half past', es: 'y media', example: 'It’s half past eight.' },
      { en: 'quarter to', es: 'menos cuarto', example: 'It’s quarter to five.' },
      { en: 'appointment', es: 'turno, cita', example: 'I have an appointment at ten.' },
      { en: 'late', es: 'tarde', example: 'Sorry, I’m late.' },
      { en: 'on time', es: 'a tiempo', example: 'The train is on time.' },
      { en: 'fifteen', es: 'quince', example: 'Fifteen minutes, please.' },
      { en: 'fifty', es: 'cincuenta', example: 'It costs fifty dollars.' },
    ],
    grammar: {
      title: 'Preposiciones de tiempo: at / on / in',
      explain: '«at» para horas (at 5 pm), «on» para días (on Monday) e «in» para meses, años y partes del día (in July, in the morning).',
      examples: [{ en: 'The meeting is at ten.', es: 'La reunión es a las diez.' }, { en: 'My birthday is in May.', es: 'Mi cumpleaños es en mayo.' }],
      exercises: [
        { prompt: 'See you ___ Friday!', options: ['at', 'on', 'in'], answer: 'on' },
        { prompt: 'The class starts ___ 9:30.', options: ['at', 'on', 'in'], answer: 'at' },
        { prompt: 'We travel ___ December.', options: ['at', 'on', 'in'], answer: 'in' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Excuse me, what time is it?', es: 'Disculpá, ¿qué hora es?' },
      { speaker: 'B', en: 'It’s quarter to three.', es: 'Son las tres menos cuarto.' },
      { speaker: 'A', en: 'Oh no, my appointment is at three!', es: '¡Uy, mi turno es a las tres!' },
      { speaker: 'B', en: 'Don’t worry, the clinic is five minutes from here.', es: 'Tranquilo, la clínica está a cinco minutos.' },
      { speaker: 'A', en: 'Thanks! I don’t want to be late.', es: '¡Gracias! No quiero llegar tarde.' },
    ],
    questions: [
      { q: 'What time is it?', options: ['2:45', '3:15', '3:00'], answer: 0 },
      { q: 'How far is the clinic?', options: ['Fifteen minutes', 'Five minutes', 'Fifty minutes'], answer: 1 },
    ],
    speak: [
      { en: 'It’s half past eight.', es: 'Son las ocho y media.' },
      { en: 'My appointment is on Monday at ten.', es: 'Mi turno es el lunes a las diez.' },
      { en: 'Sorry, I’m a little late.', es: 'Perdón, llegué un poco tarde.' },
    ],
  },
  // ------------------------------------------------------------ A2
  {
    id: 'a2-last-weekend', level: 'A2', title: 'Tu último fin de semana', topic: 'Last weekend', minutes: 7,
    vocab: [
      { en: 'went', es: 'fui (go)', example: 'I went to the beach.' },
      { en: 'had dinner', es: 'cené', example: 'We had dinner with friends.' },
      { en: 'stayed', es: 'me quedé', example: 'I stayed at home on Sunday.' },
      { en: 'relaxing', es: 'relajante', example: 'It was a relaxing weekend.' },
      { en: 'tired', es: 'cansado', example: 'I was very tired.' },
      { en: 'met', es: 'me encontré con (meet)', example: 'I met an old friend.' },
      { en: 'yesterday', es: 'ayer', example: 'Yesterday I cooked pasta.' },
      { en: 'ago', es: 'hace (tiempo)', example: 'Two days ago.' },
    ],
    grammar: {
      title: 'Pasado simple (regulares e irregulares)',
      explain: 'Los regulares suman -ed (work → worked). Los irregulares cambian (go → went, have → had, see → saw). En negativo y preguntas se usa did + verbo base.',
      examples: [{ en: 'I watched a movie.', es: 'Vi una película.' }, { en: 'Did you go out? — No, I didn’t.', es: '¿Saliste? — No.' }],
      exercises: [
        { prompt: 'Yesterday I ___ to the gym.', options: ['go', 'went', 'goed'], answer: 'went' },
        { prompt: 'We ___ dinner with my parents.', options: ['have', 'had', 'haved'], answer: 'had' },
        { prompt: '___ you see the game?', options: ['Do', 'Did', 'Was'], answer: 'Did' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'How was your weekend?', es: '¿Qué tal tu finde?' },
      { speaker: 'B', en: 'Really good! On Saturday I went to the gym and then I had dinner with my friends.', es: '¡Muy bueno! El sábado fui al gimnasio y después cené con amigos.' },
      { speaker: 'A', en: 'Nice. Where did you go?', es: 'Qué lindo. ¿Adónde fueron?' },
      { speaker: 'B', en: 'A small Italian place near my house. The pasta was amazing.', es: 'A un lugar italiano chiquito cerca de casa. La pasta era increíble.' },
      { speaker: 'A', en: 'And Sunday?', es: '¿Y el domingo?' },
      { speaker: 'B', en: 'I stayed at home and read. I was tired.', es: 'Me quedé en casa leyendo. Estaba cansado.' },
    ],
    questions: [
      { q: 'What did B do on Saturday?', options: ['Stayed at home', 'Went to the gym and had dinner', 'Went to the beach'], answer: 1 },
      { q: 'Why did B stay at home on Sunday?', options: ['It rained', 'B was tired', 'B had to work'], answer: 1 },
    ],
    speak: [
      { en: 'Yesterday I went to the gym and then I had dinner with my friends.', es: 'Ayer fui al gimnasio y después cené con amigos.' },
      { en: 'I stayed at home on Sunday.', es: 'El domingo me quedé en casa.' },
      { en: 'It was a relaxing weekend.', es: 'Fue un fin de semana tranquilo.' },
    ],
  },
  {
    id: 'a2-shopping', level: 'A2', title: 'De compras', topic: 'Shopping', minutes: 6,
    vocab: [
      { en: 'how much is it?', es: '¿cuánto cuesta?', example: 'How much is this jacket?' },
      { en: 'size', es: 'talle', example: 'Do you have it in a bigger size?' },
      { en: 'try on', es: 'probarse', example: 'Can I try it on?' },
      { en: 'fitting room', es: 'probador', example: 'The fitting room is over there.' },
      { en: 'cheaper', es: 'más barato', example: 'Do you have something cheaper?' },
      { en: 'receipt', es: 'ticket, recibo', example: 'Here’s your receipt.' },
      { en: 'refund', es: 'reembolso', example: 'Can I get a refund?' },
      { en: 'on sale', es: 'en oferta', example: 'These shoes are on sale.' },
    ],
    grammar: {
      title: 'Comparativos (-er / more)',
      explain: 'Adjetivos cortos suman -er (cheap → cheaper, big → bigger). Los largos usan «more» (expensive → more expensive). Irregulares: good → better, bad → worse.',
      examples: [{ en: 'This one is cheaper.', es: 'Este es más barato.' }, { en: 'The blue shirt is more comfortable.', es: 'La camisa azul es más cómoda.' }],
      exercises: [
        { prompt: 'This bag is ___ than that one. (big)', options: ['more big', 'bigger', 'biggest'], answer: 'bigger' },
        { prompt: 'The black coat is ___ expensive.', options: ['more', 'most', '-er'], answer: 'more' },
        { prompt: 'This size is ___ for me. (good)', options: ['gooder', 'better', 'more good'], answer: 'better' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Hi, can I help you?', es: 'Hola, ¿te ayudo?' },
      { speaker: 'B', en: 'Yes, how much is this jacket?', es: 'Sí, ¿cuánto cuesta esta campera?' },
      { speaker: 'A', en: 'It’s eighty dollars, but it’s on sale today: sixty.', es: 'Ochenta dólares, pero hoy está en oferta: sesenta.' },
      { speaker: 'B', en: 'Great. Can I try it on in a medium?', es: 'Genial. ¿Me la pruebo en mediano?' },
      { speaker: 'A', en: 'Sure, the fitting room is on the left.', es: 'Claro, el probador está a la izquierda.' },
      { speaker: 'B', en: 'Hmm, it’s a bit small. Do you have a bigger size?', es: 'Mmm, me queda un poco chica. ¿Tenés un talle más grande?' },
    ],
    questions: [
      { q: 'How much is the jacket today?', options: ['$80', '$60', '$16'], answer: 1 },
      { q: 'What’s the problem with the jacket?', options: ['Too expensive', 'Too small', 'Wrong color'], answer: 1 },
    ],
    speak: [
      { en: 'How much is this jacket?', es: '¿Cuánto cuesta esta campera?' },
      { en: 'Can I try it on?', es: '¿Me la puedo probar?' },
      { en: 'Do you have a bigger size?', es: '¿Tenés un talle más grande?' },
    ],
  },
  {
    id: 'a2-directions', level: 'A2', title: 'Pedir indicaciones', topic: 'Asking for directions', minutes: 6,
    vocab: [
      { en: 'turn left', es: 'doblar a la izquierda', example: 'Turn left at the bank.' },
      { en: 'go straight', es: 'seguir derecho', example: 'Go straight for two blocks.' },
      { en: 'block', es: 'cuadra', example: 'It’s three blocks from here.' },
      { en: 'next to', es: 'al lado de', example: 'The pharmacy is next to the café.' },
      { en: 'opposite', es: 'enfrente de', example: 'It’s opposite the station.' },
      { en: 'corner', es: 'esquina', example: 'On the corner of Main Street.' },
      { en: 'far', es: 'lejos', example: 'Is it far?' },
      { en: 'get lost', es: 'perderse', example: 'I always get lost here.' },
    ],
    grammar: {
      title: 'Imperativos y preguntas indirectas',
      explain: 'Las indicaciones usan el imperativo (Turn left, Go straight). Para preguntar con cortesía: «Could you tell me where the station is?» — el verbo va al final.',
      examples: [{ en: 'Take the second street on the right.', es: 'Tomá la segunda calle a la derecha.' }, { en: 'Could you tell me where the museum is?', es: '¿Me podrías decir dónde está el museo?' }],
      exercises: [
        { prompt: 'Could you tell me where the bank ___?', options: ['is', 'is it', 'it is is'], answer: 'is' },
        { prompt: '___ straight and turn right.', options: ['Going', 'Go', 'Goes'], answer: 'Go' },
        { prompt: 'The café is ___ the bookstore. (al lado de)', options: ['opposite', 'next to', 'far'], answer: 'next to' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Excuse me, could you tell me where the train station is?', es: 'Disculpe, ¿me podría decir dónde está la estación de tren?' },
      { speaker: 'B', en: 'Sure. Go straight for two blocks and turn left at the bank.', es: 'Claro. Siga derecho dos cuadras y doble a la izquierda en el banco.' },
      { speaker: 'A', en: 'Is it far?', es: '¿Queda lejos?' },
      { speaker: 'B', en: 'No, about ten minutes on foot. It’s opposite a big park.', es: 'No, unos diez minutos caminando. Está enfrente de un parque grande.' },
      { speaker: 'A', en: 'Perfect, thank you so much!', es: '¡Perfecto, muchas gracias!' },
    ],
    questions: [
      { q: 'Where should A turn left?', options: ['At the park', 'At the bank', 'At the corner café'], answer: 1 },
      { q: 'How long is the walk?', options: ['About ten minutes', 'Two minutes', 'Half an hour'], answer: 0 },
    ],
    speak: [
      { en: 'Could you tell me where the station is?', es: '¿Me podría decir dónde está la estación?' },
      { en: 'Go straight and turn left at the bank.', es: 'Siga derecho y doble a la izquierda en el banco.' },
      { en: 'Is it far from here?', es: '¿Queda lejos de acá?' },
    ],
  },
  {
    id: 'a2-health', level: 'A2', title: 'En el médico', topic: 'At the doctor', minutes: 6,
    vocab: [
      { en: 'headache', es: 'dolor de cabeza', example: 'I have a headache.' },
      { en: 'sore throat', es: 'dolor de garganta', example: 'She has a sore throat.' },
      { en: 'fever', es: 'fiebre', example: 'Do you have a fever?' },
      { en: 'feel better', es: 'sentirse mejor', example: 'I hope you feel better.' },
      { en: 'rest', es: 'descansar', example: 'You should rest for two days.' },
      { en: 'medicine', es: 'remedio', example: 'Take this medicine after meals.' },
      { en: 'since', es: 'desde', example: 'I feel sick since Monday.' },
      { en: 'prescription', es: 'receta', example: 'Here’s your prescription.' },
    ],
    grammar: {
      title: 'Consejos con should / shouldn’t',
      explain: '«Should» sirve para dar consejos. Va seguido del verbo base: You should drink water. You shouldn’t go to work.',
      examples: [{ en: 'You should sleep more.', es: 'Deberías dormir más.' }, { en: 'You shouldn’t drink coffee today.', es: 'No deberías tomar café hoy.' }],
      exercises: [
        { prompt: 'You ___ rest for a few days.', options: ['should', 'should to', 'shoulds'], answer: 'should' },
        { prompt: 'You shouldn’t ___ to the gym with a fever.', options: ['go', 'going', 'goes'], answer: 'go' },
        { prompt: 'I have a ___. My head hurts.', options: ['sore throat', 'headache', 'fever'], answer: 'headache' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Good morning. What’s the problem?', es: 'Buen día. ¿Qué le pasa?' },
      { speaker: 'B', en: 'I have a sore throat and a headache since Tuesday.', es: 'Tengo dolor de garganta y de cabeza desde el martes.' },
      { speaker: 'A', en: 'Do you have a fever?', es: '¿Tiene fiebre?' },
      { speaker: 'B', en: 'A little, last night.', es: 'Un poco, anoche.' },
      { speaker: 'A', en: 'It looks like a cold. You should rest and drink a lot of water.', es: 'Parece un resfrío. Debería descansar y tomar mucha agua.' },
      { speaker: 'B', en: 'Should I stay home from work?', es: '¿Me quedo sin ir a trabajar?' },
      { speaker: 'A', en: 'Yes, for two days. You’ll feel better soon.', es: 'Sí, dos días. Pronto se va a sentir mejor.' },
    ],
    questions: [
      { q: 'Since when does B feel sick?', options: ['Since Tuesday', 'Since last night', 'Since Sunday'], answer: 0 },
      { q: 'What does the doctor recommend?', options: ['Go to the gym', 'Rest and drink water', 'Take a trip'], answer: 1 },
    ],
    speak: [
      { en: 'I have a sore throat since Tuesday.', es: 'Me duele la garganta desde el martes.' },
      { en: 'You should rest and drink a lot of water.', es: 'Deberías descansar y tomar mucha agua.' },
      { en: 'I hope you feel better soon.', es: 'Espero que te mejores pronto.' },
    ],
  },
  // ------------------------------------------------------------ B1
  {
    id: 'b1-plans', level: 'B1', title: 'Planes y predicciones', topic: 'Future plans', minutes: 8,
    vocab: [
      { en: 'plan to', es: 'planear', example: 'I plan to launch the store in March.' },
      { en: 'goal', es: 'objetivo', example: 'My goal is to speak more fluently.' },
      { en: 'probably', es: 'probablemente', example: 'It will probably rain.' },
      { en: 'look forward to', es: 'esperar con ganas', example: 'I’m looking forward to the trip.' },
      { en: 'deadline', es: 'fecha límite', example: 'The deadline is next Friday.' },
      { en: 'launch', es: 'lanzar', example: 'We’re launching a new product.' },
      { en: 'grow', es: 'crecer', example: 'I want the company to grow.' },
      { en: 'by the end of', es: 'para fines de', example: 'By the end of the year.' },
    ],
    grammar: {
      title: 'Will vs. going to vs. presente continuo',
      explain: '«Going to» = planes ya decididos. «Will» = decisiones del momento y predicciones. Presente continuo = citas y arreglos con fecha (I’m meeting Ana on Friday).',
      examples: [{ en: 'I’m going to study every morning.', es: 'Voy a estudiar todas las mañanas.' }, { en: 'I think it will be a good year.', es: 'Creo que va a ser un buen año.' }, { en: 'We’re launching on Monday.', es: 'Lanzamos el lunes.' }],
      exercises: [
        { prompt: 'The phone is ringing. — I ___ get it!', options: ['’ll', '’m going to', 'am getting'], answer: '’ll' },
        { prompt: 'I’ve decided: I ___ learn to cook this year.', options: ['will', 'am going to', 'learn'], answer: 'am going to' },
        { prompt: 'I ___ my accountant tomorrow at 3. (cita)', options: ['meet', 'am meeting', 'will to meet'], answer: 'am meeting' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'So, what are your plans for next year?', es: '¿Y qué planes tenés para el año que viene?' },
      { speaker: 'B', en: 'I’m going to launch an online store for my company.', es: 'Voy a lanzar una tienda online para mi empresa.' },
      { speaker: 'A', en: 'That’s exciting! When?', es: '¡Qué bueno! ¿Cuándo?' },
      { speaker: 'B', en: 'We’re meeting the designers on Monday, and the deadline is March.', es: 'Nos juntamos con los diseñadores el lunes, y la fecha límite es marzo.' },
      { speaker: 'A', en: 'Do you think it will be ready?', es: '¿Creés que va a estar listo?' },
      { speaker: 'B', en: 'Probably. I’m really looking forward to it.', es: 'Probablemente. Tengo muchas ganas.' },
    ],
    questions: [
      { q: 'What is B going to launch?', options: ['An app', 'An online store', 'A restaurant'], answer: 1 },
      { q: 'When is the meeting with the designers?', options: ['In March', 'On Monday', 'Next year'], answer: 1 },
    ],
    speak: [
      { en: 'I’m going to launch an online store next year.', es: 'El año que viene voy a lanzar una tienda online.' },
      { en: 'I’m really looking forward to it.', es: 'Tengo muchas ganas.' },
      { en: 'I think it will probably be ready by March.', es: 'Creo que probablemente esté listo para marzo.' },
    ],
  },
  {
    id: 'b1-opinions', level: 'B1', title: 'Dar tu opinión', topic: 'Giving opinions', minutes: 8,
    vocab: [
      { en: 'in my opinion', es: 'en mi opinión', example: 'In my opinion, remote work is better.' },
      { en: 'I agree', es: 'estoy de acuerdo', example: 'I agree with you.' },
      { en: 'I’m not sure', es: 'no estoy seguro', example: 'I’m not sure about that.' },
      { en: 'on the other hand', es: 'por otro lado', example: 'On the other hand, it’s expensive.' },
      { en: 'advantage', es: 'ventaja', example: 'The main advantage is time.' },
      { en: 'drawback', es: 'desventaja', example: 'One drawback is the noise.' },
      { en: 'point', es: 'argumento, punto', example: 'That’s a good point.' },
      { en: 'depend on', es: 'depender de', example: 'It depends on the situation.' },
    ],
    grammar: {
      title: 'Conectores: although, however, because, so',
      explain: '«Although» une dos ideas opuestas en una oración; «However» empieza una oración nueva. «Because» da la causa y «so» la consecuencia.',
      examples: [{ en: 'Although it’s cheap, it’s not good.', es: 'Aunque es barato, no es bueno.' }, { en: 'It’s cheap. However, it’s not good.', es: 'Es barato. Sin embargo, no es bueno.' }],
      exercises: [
        { prompt: 'I stayed home ___ I was tired.', options: ['so', 'because', 'however'], answer: 'because' },
        { prompt: 'It was late, ___ we took a taxi.', options: ['so', 'although', 'because'], answer: 'so' },
        { prompt: '___ it was raining, we went out.', options: ['However', 'Although', 'So'], answer: 'Although' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'What do you think about working from home?', es: '¿Qué pensás de trabajar desde casa?' },
      { speaker: 'B', en: 'In my opinion, it has a lot of advantages. I save two hours a day.', es: 'Para mí tiene muchas ventajas. Me ahorro dos horas por día.' },
      { speaker: 'A', en: 'I agree, but on the other hand, I miss my colleagues.', es: 'Coincido, pero por otro lado extraño a mis compañeros.' },
      { speaker: 'B', en: 'That’s a good point. Maybe a mix is the best option.', es: 'Buen punto. Quizás lo mejor sea una mezcla.' },
      { speaker: 'A', en: 'I think it depends on the job.', es: 'Creo que depende del trabajo.' },
    ],
    questions: [
      { q: 'What advantage does B mention?', options: ['Saving time', 'Meeting people', 'Earning more'], answer: 0 },
      { q: 'What drawback does A mention?', options: ['Noise', 'Missing colleagues', 'Bad internet'], answer: 1 },
    ],
    speak: [
      { en: 'In my opinion, it has a lot of advantages.', es: 'En mi opinión, tiene muchas ventajas.' },
      { en: 'That’s a good point, although I’m not sure.', es: 'Buen punto, aunque no estoy seguro.' },
      { en: 'I think it depends on the situation.', es: 'Creo que depende de la situación.' },
    ],
  },
  {
    id: 'b1-experiences', level: 'B1', title: 'Experiencias', topic: 'Life experiences', minutes: 8,
    vocab: [
      { en: 'ever', es: 'alguna vez', example: 'Have you ever been to Japan?' },
      { en: 'never', es: 'nunca', example: 'I’ve never tried sushi.' },
      { en: 'already', es: 'ya', example: 'I’ve already finished.' },
      { en: 'yet', es: 'todavía / ya (preg.)', example: 'Have you finished yet?' },
      { en: 'abroad', es: 'en el exterior', example: 'I’ve lived abroad.' },
      { en: 'experience', es: 'experiencia', example: 'It was an amazing experience.' },
      { en: 'so far', es: 'hasta ahora', example: 'So far, so good.' },
      { en: 'for / since', es: 'durante / desde', example: 'I’ve known her for ten years.' },
    ],
    grammar: {
      title: 'Present perfect (have + participio)',
      explain: 'Hablamos de experiencias sin fecha o de algo que sigue hasta hoy. Con fecha concreta usamos el pasado simple: I’ve been to Chile (sin fecha) / I went to Chile in 2020.',
      examples: [{ en: 'I’ve visited Brazil twice.', es: 'Fui a Brasil dos veces.' }, { en: 'She has worked here since 2019.', es: 'Trabaja acá desde 2019.' }],
      exercises: [
        { prompt: 'Have you ___ been to Europe?', options: ['ever', 'yet', 'since'], answer: 'ever' },
        { prompt: 'I’ve lived here ___ five years.', options: ['since', 'for', 'ago'], answer: 'for' },
        { prompt: 'I ___ to Chile in 2020.', options: ['have gone', 'went', 'have went'], answer: 'went' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Have you ever lived abroad?', es: '¿Alguna vez viviste en el exterior?' },
      { speaker: 'B', en: 'Yes, I lived in Spain for a year in 2018.', es: 'Sí, viví un año en España en 2018.' },
      { speaker: 'A', en: 'Wow. Have you been back since then?', es: '¡Uau! ¿Volviste desde entonces?' },
      { speaker: 'B', en: 'Not yet, but I’d love to. What about you?', es: 'Todavía no, pero me encantaría. ¿Y vos?' },
      { speaker: 'A', en: 'I’ve never lived abroad, but I’ve traveled a lot in South America.', es: 'Nunca viví afuera, pero viajé mucho por Sudamérica.' },
    ],
    questions: [
      { q: 'How long did B live in Spain?', options: ['A year', 'Two years', 'Six months'], answer: 0 },
      { q: 'Has A lived abroad?', options: ['Yes, in Spain', 'No, never', 'Yes, in Brazil'], answer: 1 },
    ],
    speak: [
      { en: 'Have you ever lived abroad?', es: '¿Alguna vez viviste en el exterior?' },
      { en: 'I’ve never been to Japan, but I’d love to go.', es: 'Nunca fui a Japón, pero me encantaría.' },
      { en: 'I’ve known my best friend for ten years.', es: 'Conozco a mi mejor amigo hace diez años.' },
    ],
  },
  {
    id: 'b1-work-meeting', level: 'B1', title: 'Reuniones de trabajo', topic: 'Work meetings', minutes: 8,
    vocab: [
      { en: 'agenda', es: 'orden del día', example: 'Let’s go through the agenda.' },
      { en: 'follow up', es: 'hacer seguimiento', example: 'I’ll follow up by email.' },
      { en: 'budget', es: 'presupuesto', example: 'We need to review the budget.' },
      { en: 'suggest', es: 'sugerir', example: 'I suggest we start with sales.' },
      { en: 'postpone', es: 'posponer', example: 'Can we postpone the call?' },
      { en: 'figure out', es: 'resolver, descifrar', example: 'We need to figure out the price.' },
      { en: 'on track', es: 'encaminado', example: 'The project is on track.' },
      { en: 'wrap up', es: 'cerrar, terminar', example: 'Let’s wrap up the meeting.' },
    ],
    grammar: {
      title: 'Propuestas: Let’s / How about / Why don’t we',
      explain: 'Para proponer algo con naturalidad: «Let’s + verbo», «How about + -ing» y «Why don’t we + verbo». Suenan colaborativos, no órdenes.',
      examples: [{ en: 'Let’s start with the budget.', es: 'Empecemos por el presupuesto.' }, { en: 'How about meeting on Thursday?', es: '¿Qué tal si nos juntamos el jueves?' }],
      exercises: [
        { prompt: 'How about ___ the call to Friday?', options: ['move', 'moving', 'to move'], answer: 'moving' },
        { prompt: 'Why don’t we ___ a short break?', options: ['take', 'taking', 'took'], answer: 'take' },
        { prompt: '___ wrap up for today.', options: ['Let’s', 'How about', 'Why'], answer: 'Let’s' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'OK everyone, let’s go through the agenda.', es: 'Bueno, repasemos el orden del día.' },
      { speaker: 'B', en: 'First, the online store. Is it on track?', es: 'Primero, la tienda online. ¿Viene encaminada?' },
      { speaker: 'A', en: 'Mostly. We still need to figure out the shipping costs.', es: 'En general sí. Falta resolver los costos de envío.' },
      { speaker: 'B', en: 'How about asking two carriers for a quote?', es: '¿Qué tal si pedimos presupuesto a dos transportistas?' },
      { speaker: 'A', en: 'Good idea. I’ll follow up by email tomorrow.', es: 'Buena idea. Mañana hago el seguimiento por mail.' },
      { speaker: 'B', en: 'Great. Let’s wrap up here.', es: 'Genial. Cerremos acá.' },
    ],
    questions: [
      { q: 'What do they still need to figure out?', options: ['The design', 'Shipping costs', 'The budget'], answer: 1 },
      { q: 'How will A follow up?', options: ['By phone', 'In person', 'By email'], answer: 2 },
    ],
    speak: [
      { en: 'Let’s go through the agenda.', es: 'Repasemos el orden del día.' },
      { en: 'We still need to figure out the shipping costs.', es: 'Todavía tenemos que resolver los costos de envío.' },
      { en: 'I’ll follow up by email tomorrow.', es: 'Mañana hago el seguimiento por mail.' },
    ],
  },
  // ------------------------------------------------------------ B2
  {
    id: 'b2-regrets', level: 'B2', title: 'Hipótesis y arrepentimientos', topic: 'Regrets and hypotheticals', minutes: 9,
    vocab: [
      { en: 'wish', es: 'desear, ojalá', example: 'I wish I had more time.' },
      { en: 'regret', es: 'arrepentirse', example: 'I don’t regret it.' },
      { en: 'otherwise', es: 'si no, de lo contrario', example: 'Hurry, otherwise we’ll miss it.' },
      { en: 'take a risk', es: 'arriesgarse', example: 'Sometimes you have to take a risk.' },
      { en: 'looking back', es: 'mirando atrás', example: 'Looking back, it was the right choice.' },
      { en: 'turn out', es: 'resultar', example: 'It turned out well.' },
      { en: 'hindsight', es: 'retrospectiva', example: 'In hindsight, I should have asked.' },
      { en: 'make up your mind', es: 'decidirse', example: 'I can’t make up my mind.' },
    ],
    grammar: {
      title: 'Condicionales 2 y 3, wish',
      explain: 'Segundo condicional = hipótesis presente (If I had time, I would travel). Tercero = pasado que no pasó (If I had left earlier, I would have caught the train). «I wish + pasado» para deseos presentes.',
      examples: [{ en: 'If I lived closer, I would walk to work.', es: 'Si viviera más cerca, iría caminando.' }, { en: 'If we had planned better, we would have finished.', es: 'Si hubiéramos planificado mejor, habríamos terminado.' }],
      exercises: [
        { prompt: 'If I ___ more time, I would learn the piano.', options: ['have', 'had', 'would have'], answer: 'had' },
        { prompt: 'If she had studied, she ___ passed.', options: ['would have', 'would', 'had'], answer: 'would have' },
        { prompt: 'I wish I ___ speak Japanese.', options: ['can', 'could', 'will'], answer: 'could' },
      ],
    },
    dialogue: [
      { speaker: 'A', en: 'Do you ever regret leaving your old job?', es: '¿Alguna vez te arrepentís de haber dejado tu trabajo anterior?' },
      { speaker: 'B', en: 'Not really. Looking back, it was the right choice.', es: 'No mucho. Mirando atrás, fue la decisión correcta.' },
      { speaker: 'A', en: 'Would you have started the company if you’d stayed?', es: '¿Habrías arrancado la empresa si te hubieras quedado?' },
      { speaker: 'B', en: 'Probably not. If I hadn’t taken the risk, I wouldn’t be here.', es: 'Probablemente no. Si no me hubiera arriesgado, no estaría acá.' },
      { speaker: 'A', en: 'I wish I were that brave.', es: 'Ojalá yo fuera así de valiente.' },
    ],
    questions: [
      { q: 'How does B feel about leaving the old job?', options: ['Regrets it', 'Thinks it was right', 'Isn’t sure'], answer: 1 },
      { q: 'What would have happened if B had stayed?', options: ['B would have a company', 'B probably wouldn’t have started the company', 'B would be richer'], answer: 1 },
    ],
    speak: [
      { en: 'Looking back, it was the right choice.', es: 'Mirando atrás, fue la decisión correcta.' },
      { en: 'If I hadn’t taken the risk, I wouldn’t be here.', es: 'Si no me hubiera arriesgado, no estaría acá.' },
      { en: 'I wish I had more free time.', es: 'Ojalá tuviera más tiempo libre.' },
    ],
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
