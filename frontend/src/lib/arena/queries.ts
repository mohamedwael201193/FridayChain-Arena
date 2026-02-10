// FridayChain Arena — GraphQL Query & Mutation Strings
//
// All GraphQL operations used by the frontend to interact with the on-chain contract.
// Queries are read-only (service layer). Mutations propose new blocks (contract layer).

// ── Player Queries ───────────────────────────────────────────────────────

export const QUERY_PLAYER = `
  query Player($wallet: String!) {
    player(wallet: $wallet) {
      wallet
      discordUsername
      registeredAtMicros
    }
  }
`;

export const QUERY_ALL_PLAYERS = `
  query AllPlayers {
    allPlayers {
      wallet
      discordUsername
      registeredAtMicros
    }
  }
`;

export const QUERY_PLAYER_COUNT = `
  query PlayerCount {
    playerCount
  }
`;

// ── Tournament Queries ───────────────────────────────────────────────────

export const QUERY_ACTIVE_TOURNAMENT = `
  query ActiveTournament {
    activeTournament {
      id
      seed
      startTimeMicros
      endTimeMicros
      active
      totalPlayers
      totalCompletions
    }
  }
`;

export const QUERY_IS_TOURNAMENT_ACTIVE = `
  query IsTournamentActive {
    isTournamentActive
  }
`;

export const QUERY_PUZZLE_BOARD = `
  query PuzzleBoard {
    puzzleBoard
  }
`;

export const QUERY_TOURNAMENT_STATS = `
  query TournamentStats {
    tournamentStats {
      tournamentId
      totalPlayers
      totalCompletions
      averageScore
      bestScore
      isActive
    }
  }
`;

export const QUERY_PAST_TOURNAMENTS = `
  query PastTournaments($limit: Int) {
    pastTournaments(limit: $limit) {
      id
      seed
      startTimeMicros
      endTimeMicros
      active
      totalPlayers
      totalCompletions
    }
  }
`;

// ── Game State Queries ───────────────────────────────────────────────────

export const QUERY_PLAYER_GAME_STATE = `
  query PlayerGameState($wallet: String!) {
    playerGameState(wallet: $wallet) {
      board
      givenMask
      penaltyCount
      moveCount
      startTimeMicros
      completed
      completionTimeMicros
      score
    }
  }
`;

// ── Leaderboard Queries ──────────────────────────────────────────────────

export const QUERY_LEADERBOARD = `
  query Leaderboard($limit: Int) {
    leaderboard(limit: $limit) {
      wallet
      discordUsername
      score
      completionTimeMicros
      penaltyCount
      moveCount
      completed
    }
  }
`;

export const QUERY_CACHED_LEADERBOARD = `
  query CachedLeaderboard {
    cachedLeaderboard {
      entries {
        wallet
        discordUsername
        score
        completionTimeMicros
        penaltyCount
        moveCount
        completed
      }
      tournamentId
      isActive
      fetchedAtMicros
    }
  }
`;

// ── Verification Queries ─────────────────────────────────────────────────

export const QUERY_VERIFY_GAME = `
  query VerifyGame($seed: Int!, $moves: [MoveInput!]!) {
    verifyGame(seed: $seed, moves: $moves) {
      valid
      totalMoves
      penaltyCount
      finalScore
      boardComplete
    }
  }
`;

// ── Event Queries ────────────────────────────────────────────────────────

export const QUERY_RECENT_EVENTS = `
  query RecentEvents($limit: Int) {
    recentEvents(limit: $limit)
  }
`;

export const QUERY_EVENT_COUNT = `
  query EventCount {
    eventCount
  }
`;

// ── Mutations ────────────────────────────────────────────────────────────

export const MUTATION_REGISTER_PLAYER = `
  mutation RegisterPlayer($discordUsername: String!) {
    registerPlayer(discordUsername: $discordUsername)
  }
`;

export const MUTATION_UPDATE_USERNAME = `
  mutation UpdateUsername($newDiscordUsername: String!) {
    updateUsername(newDiscordUsername: $newDiscordUsername)
  }
`;

export const MUTATION_PLACE_CELL = `
  mutation PlaceCell($row: Int!, $col: Int!, $value: Int!) {
    placeCell(row: $row, col: $col, value: $value)
  }
`;

export const MUTATION_CLEAR_CELL = `
  mutation ClearCell($row: Int!, $col: Int!) {
    clearCell(row: $row, col: $col)
  }
`;

export const MUTATION_SUBSCRIBE_TO_HUB = `
  mutation SubscribeToHub {
    subscribeToHub
  }
`;

export const MUTATION_REQUEST_LEADERBOARD = `
  mutation RequestLeaderboard($limit: Int) {
    requestLeaderboard(limit: $limit)
  }
`;
