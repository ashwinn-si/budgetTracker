import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { Tag } from "@/models/Tag";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/spreadsheets",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      const db = await connectToDatabase();
      if (db) {
        try {
          let existingUser = await User.findOne({ email: user.email.toLowerCase() });

          if (!existingUser) {
            existingUser = await User.create({
              name: user.name || "Google User",
              email: user.email.toLowerCase(),
              googleId: account?.providerAccountId,
              googleAccessToken: account?.access_token,
              googleRefreshToken: account?.refresh_token,
              sheetsLinked: Boolean(account?.access_token),
            });

            // Initialize default tags
            const defaultTags = [
              { userId: existingUser._id.toString(), name: "Groceries", colorKey: "#22C55E" },
              { userId: existingUser._id.toString(), name: "Dining & Coffee", colorKey: "#F59E0B" },
              { userId: existingUser._id.toString(), name: "Housing & Bills", colorKey: "#3B82F6" },
              { userId: existingUser._id.toString(), name: "Health & Gym", colorKey: "#EC4899" },
              { userId: existingUser._id.toString(), name: "Transport", colorKey: "#14B8A6" },
              { userId: existingUser._id.toString(), name: "Entertainment", colorKey: "#8B5CF6" },
            ];
            await Tag.insertMany(defaultTags);
          } else {
            // Update google access tokens if provided
            if (account?.access_token) {
              existingUser.googleAccessToken = account.access_token;
              existingUser.sheetsLinked = true;
            }
            if (account?.refresh_token) {
              existingUser.googleRefreshToken = account.refresh_token;
            }
            await existingUser.save();
          }
        } catch (err) {
          console.error("NextAuth signIn hook error:", err);
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // @ts-expect-error adding id to session user
        session.user.id = token.sub;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "default_nextauth_secret_dev_32_chars_12345",
  session: { strategy: "jwt" },
});

export { handler as GET, handler as POST };
