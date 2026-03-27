import { db, schema } from "./index";

const { dolls, missions } = schema;

export async function seed() {
  const existingDolls = db.select().from(dolls).all();
  if (existingDolls.length > 0) return;

  db.insert(dolls)
    .values([
      {
        name: "Luna Cipher",
        codename: "MOONLIGHT",
        description:
          "A master of classical substitution ciphers. Elegant and mysterious.",
        cipherType: "substitution",
        difficulty: 1,
        status: "active",
      },
      {
        name: "Nova Shift",
        codename: "STARFALL",
        description:
          "Specializes in transposition ciphers. Quick and unpredictable.",
        cipherType: "transposition",
        difficulty: 2,
        status: "active",
      },
      {
        name: "Echo Vector",
        codename: "PHANTOM",
        description:
          "An AES encryption expert. Cold, calculating, and precise.",
        cipherType: "aes",
        difficulty: 4,
        status: "active",
      },
      {
        name: "Aria Prime",
        codename: "GENESIS",
        description:
          "RSA and public-key cryptography specialist. The most elite operative.",
        cipherType: "rsa",
        difficulty: 5,
        status: "active",
      },
    ])
    .run();

  db.insert(missions)
    .values([
      {
        title: "The First Letter",
        description: "Decode Luna's welcome message using a simple Caesar shift.",
        dollId: 1,
        encryptedMessage: "Zhofrph wr Flskhu Groov",
        solution: "Welcome to Cipher Dolls",
        hint: "Try shifting each letter back by 3",
        reward: 10,
        difficulty: 1,
      },
      {
        title: "Scrambled Orders",
        description: "Nova has scrambled the mission briefing. Unscramble it.",
        dollId: 2,
        encryptedMessage: "eTh imssion si a og",
        solution: "The mission is a go",
        hint: "The letters in each word are rearranged",
        reward: 20,
        difficulty: 2,
      },
      {
        title: "Phantom Protocol",
        description: "Decrypt Echo's intercepted AES-encrypted transmission.",
        dollId: 3,
        encryptedMessage: "U2FsdGVkX1+abc123encrypted",
        solution: "Phantom protocol activated",
        hint: "The key is hidden in the codename",
        reward: 40,
        difficulty: 4,
      },
    ])
    .run();

  console.log("Database seeded successfully");
}
