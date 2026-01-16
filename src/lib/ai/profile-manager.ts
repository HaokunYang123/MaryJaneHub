// Mary's Personal Profile Manager - Jane's Memory
// Stores everything Jane learns about Mary in Supabase

import { supabase } from '@/lib/supabase';

// Profile structure - everything Jane knows about Mary
export interface MaryProfile {
  // Core Identity
  personal: {
    name: string;
    nickname?: string;
    age: number;
    birthday?: string;
    location: string;
    timezone: string;
  };

  // Business Empire
  businesses: {
    dispensaries: {
      name: string;
      location: string;
      notes?: string;
    }[];
    rentalProperties: {
      name: string;
      location: string;
      type: string;
      units?: number;
      notes?: string;
    }[];
    otherBusinesses: {
      name: string;
      type: string;
      notes?: string;
    }[];
  };

  // Preferences & Personality
  preferences: {
    communicationStyle: string; // e.g., "brief and direct", "detailed explanations"
    preferredName: string; // What Jane should call her
    favoriteTopics: string[];
    dislikedTopics: string[];
    workingHours?: { start: string; end: string };
    decisionMakingStyle?: string;
  };

  // Important People
  contacts: {
    name: string;
    relationship: string;
    notes?: string;
  }[];

  // Schedule & Reminders
  schedule: {
    recurringEvents: {
      title: string;
      frequency: string; // "daily", "weekly", "monthly"
      dayOfWeek?: string;
      time?: string;
      notes?: string;
    }[];
    upcomingEvents: {
      title: string;
      date: string;
      time?: string;
      notes?: string;
    }[];
    reminders: {
      content: string;
      dueDate?: string;
      priority: 'low' | 'medium' | 'high';
      completed: boolean;
    }[];
  };

  // Financial Preferences
  financial: {
    preferredBank?: string;
    reportingPreferences?: string[];
    budgetGoals?: string[];
    investmentInterests?: string[];
  };

  // Learned Facts & Memory
  memories: {
    fact: string;
    category: string;
    learnedAt: string;
    source?: string;
  }[];

  // Conversation Insights
  conversationInsights: {
    frequentQuestions: string[];
    commonTasks: string[];
    lastTopics: string[];
  };

  // Metadata
  metadata: {
    profileVersion: number;
    lastUpdated: string;
    createdAt: string;
  };
}

// Default profile for Mary
const DEFAULT_PROFILE: MaryProfile = {
  personal: {
    name: "Mary",
    age: 70,
    location: "California",
    timezone: "America/Los_Angeles"
  },
  businesses: {
    dispensaries: [
      { name: "Green Leaf Wellness", location: "Santa Ana", notes: "Flagship location" },
      { name: "Green Leaf Wellness", location: "Long Beach" },
      { name: "Green Leaf Wellness", location: "Palm Springs" }
    ],
    rentalProperties: [
      { name: "Riverside Property", location: "Riverside, CA", type: "Multi-family", units: 8 },
      { name: "Corona Property", location: "Corona, CA", type: "Multi-family", units: 12 },
      { name: "Anaheim Property", location: "Anaheim, CA", type: "Single Family" },
      { name: "Ontario Property", location: "Ontario, CA", type: "Commercial/Retail" }
    ],
    otherBusinesses: []
  },
  preferences: {
    communicationStyle: "warm but efficient",
    preferredName: "Mary",
    favoriteTopics: [],
    dislikedTopics: []
  },
  contacts: [],
  schedule: {
    recurringEvents: [],
    upcomingEvents: [],
    reminders: []
  },
  financial: {
    reportingPreferences: ["monthly P&L", "cash position"]
  },
  memories: [],
  conversationInsights: {
    frequentQuestions: [],
    commonTasks: [],
    lastTopics: []
  },
  metadata: {
    profileVersion: 1,
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }
};

const PROFILE_ID = 'mary_primary'; // Single user for now

class ProfileManager {
  private cachedProfile: MaryProfile | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 60000; // 1 minute cache

  // Get Mary's profile (with caching)
  async getProfile(): Promise<MaryProfile> {
    // Return cached if valid
    if (this.cachedProfile && Date.now() < this.cacheExpiry) {
      return this.cachedProfile;
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_data')
        .eq('id', PROFILE_ID)
        .single();

      if (error || !data) {
        // Profile doesn't exist, create it
        console.log('Creating new profile for Mary...');
        await this.createProfile();
        return DEFAULT_PROFILE;
      }

      this.cachedProfile = data.profile_data as MaryProfile;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      return this.cachedProfile;

    } catch (error) {
      console.error('Error fetching profile:', error);
      return DEFAULT_PROFILE;
    }
  }

  // Create initial profile
  private async createProfile(): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: PROFILE_ID,
          profile_data: DEFAULT_PROFILE,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating profile:', error);
      }
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  }

  // Update the entire profile
  async updateProfile(profile: MaryProfile): Promise<boolean> {
    try {
      profile.metadata.lastUpdated = new Date().toISOString();
      profile.metadata.profileVersion += 1;

      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: PROFILE_ID,
          profile_data: profile,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating profile:', error);
        return false;
      }

      // Update cache
      this.cachedProfile = profile;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      return true;

    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    }
  }

  // Add a memory/learned fact
  async addMemory(fact: string, category: string, source?: string): Promise<boolean> {
    const profile = await this.getProfile();

    // Check for duplicate
    const exists = profile.memories.some(m =>
      m.fact.toLowerCase() === fact.toLowerCase()
    );

    if (!exists) {
      profile.memories.push({
        fact,
        category,
        learnedAt: new Date().toISOString(),
        source
      });
      return await this.updateProfile(profile);
    }
    return true;
  }

  // Add a contact
  async addContact(name: string, relationship: string, notes?: string): Promise<boolean> {
    const profile = await this.getProfile();

    const existingIndex = profile.contacts.findIndex(c =>
      c.name.toLowerCase() === name.toLowerCase()
    );

    if (existingIndex >= 0) {
      profile.contacts[existingIndex] = { name, relationship, notes };
    } else {
      profile.contacts.push({ name, relationship, notes });
    }

    return await this.updateProfile(profile);
  }

  // Add a reminder
  async addReminder(content: string, dueDate?: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<boolean> {
    const profile = await this.getProfile();

    profile.schedule.reminders.push({
      content,
      dueDate,
      priority,
      completed: false
    });

    return await this.updateProfile(profile);
  }

  // Add an upcoming event
  async addEvent(title: string, date: string, time?: string, notes?: string): Promise<boolean> {
    const profile = await this.getProfile();

    profile.schedule.upcomingEvents.push({
      title,
      date,
      time,
      notes
    });

    // Sort by date
    profile.schedule.upcomingEvents.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return await this.updateProfile(profile);
  }

  // Update preferences
  async updatePreference(key: keyof MaryProfile['preferences'], value: string | string[]): Promise<boolean> {
    const profile = await this.getProfile();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile.preferences as any)[key] = value;
    return await this.updateProfile(profile);
  }

  // Add to favorites/likes
  async addFavoriteTopic(topic: string): Promise<boolean> {
    const profile = await this.getProfile();
    if (!profile.preferences.favoriteTopics.includes(topic)) {
      profile.preferences.favoriteTopics.push(topic);
      return await this.updateProfile(profile);
    }
    return true;
  }

  // Track conversation topic
  async trackTopic(topic: string): Promise<void> {
    const profile = await this.getProfile();

    // Keep last 10 topics
    profile.conversationInsights.lastTopics.unshift(topic);
    if (profile.conversationInsights.lastTopics.length > 10) {
      profile.conversationInsights.lastTopics.pop();
    }

    await this.updateProfile(profile);
  }

  // Get profile summary for AI context
  async getProfileSummary(): Promise<string> {
    const profile = await this.getProfile();

    let summary = `
=== MARY'S PERSONAL PROFILE ===

**Name:** ${profile.personal.name}${profile.personal.nickname ? ` (goes by "${profile.personal.nickname}")` : ''}
**Age:** ${profile.personal.age}
**Location:** ${profile.personal.location}
**Timezone:** ${profile.personal.timezone}

**Communication Style:** ${profile.preferences.communicationStyle}
**Call her:** ${profile.preferences.preferredName}
`;

    if (profile.preferences.favoriteTopics.length > 0) {
      summary += `**Favorite Topics:** ${profile.preferences.favoriteTopics.join(', ')}\n`;
    }

    if (profile.contacts.length > 0) {
      summary += `\n**Important People:**\n`;
      profile.contacts.forEach(c => {
        summary += `- ${c.name} (${c.relationship})${c.notes ? ` - ${c.notes}` : ''}\n`;
      });
    }

    if (profile.memories.length > 0) {
      summary += `\n**Things I Remember About Mary:**\n`;
      profile.memories.slice(-15).forEach(m => {
        summary += `- ${m.fact}\n`;
      });
    }

    const activeReminders = profile.schedule.reminders.filter(r => !r.completed);
    if (activeReminders.length > 0) {
      summary += `\n**Active Reminders:**\n`;
      activeReminders.forEach(r => {
        summary += `- ${r.content}${r.dueDate ? ` (due: ${r.dueDate})` : ''} [${r.priority}]\n`;
      });
    }

    const upcomingEvents = profile.schedule.upcomingEvents.filter(e =>
      new Date(e.date) >= new Date()
    ).slice(0, 5);

    if (upcomingEvents.length > 0) {
      summary += `\n**Upcoming Events:**\n`;
      upcomingEvents.forEach(e => {
        summary += `- ${e.title} on ${e.date}${e.time ? ` at ${e.time}` : ''}\n`;
      });
    }

    if (profile.conversationInsights.lastTopics.length > 0) {
      summary += `\n**Recent Conversation Topics:** ${profile.conversationInsights.lastTopics.slice(0, 5).join(', ')}\n`;
    }

    summary += `\n=== END PROFILE ===`;

    return summary;
  }

  // Clear cache (useful after updates)
  clearCache(): void {
    this.cachedProfile = null;
    this.cacheExpiry = 0;
  }
}

export const profileManager = new ProfileManager();
