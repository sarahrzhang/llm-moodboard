// Core music entities used in the app (client + server)

export type TrackID = string;

export type Track = {
  id: TrackID;
  name: string;
  artists: string[]; // artist names
  image?: string; // usually track.album.images[0].url
  scores?: MoodScores;
};

export type Album = {
  image?: string;
  name: string;
  artists: string[];
};

export type MoodScores = {
  hype: number;
  focus: number;
  chill: number;
};
