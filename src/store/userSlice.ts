import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db, auth } from "@/firebase/firebase";
import type { IUser } from "@/assets/interfaces/user";
import { UserRole } from "@/assets/enums";

export interface UserState {
  userProfile: IUser;
  status: "idle" | "loading" | "failed";
  updateStatus: "idle" | "loading" | "succeeded" | "failed";
}

const initUser = {
  id: null,
  name: "",
  email: "",
  avatar: "/avatar-default.avif",
  role: UserRole.STUDENT, // Default role
}

const initialState: UserState = {
  userProfile: initUser,
  status: "idle",
  updateStatus: "idle",
};

export const fetchUser = createAsyncThunk(
  "user/fetchUser",
  async (userId: string) => {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) throw new Error("User not found");
    const data = userDoc.data();
    return {
      id: userId,
      name: data.name,
      email: data.email,
      avatar: data.avatar || "/avatar-default.avif",
      role: data.role,
    };
  }
);

export const updateUserProfile = createAsyncThunk(
  "user/updateUserProfile",
  async (
    { userId, name, avatar }: { userId: string; name: string; avatar: string },
    { rejectWithValue }
  ) => {
    try {
      await updateDoc(doc(db, "users", userId), { name, avatar });
      if (auth.currentUser) {
        try {
          const photoURL =
            avatar.startsWith("data:") && avatar.length > 2048 ? null : avatar;
          await updateProfile(auth.currentUser, {
            displayName: name,
            photoURL: photoURL,
          });
        } catch (authError: unknown) {
          console.warn("Could not update Firebase Auth profile:", authError);
        }
      }
      return { name, avatar };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  }
);

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    clearUser: (state) => {
      state.userProfile = initUser;
      state.status = "idle";
      state.updateStatus = "idle";
    },
    setUserData: (state, action) => {
      state.userProfile = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.status = "idle";
        state.userProfile = action.payload;
      })
      .addCase(fetchUser.rejected, (state) => {
        state.status = "failed";
      })
      .addCase(updateUserProfile.pending, (state) => {
        state.updateStatus = "loading";
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.updateStatus = "idle";
        state.userProfile.name = action.payload.name;
        state.userProfile.avatar = action.payload.avatar;
      })
      .addCase(updateUserProfile.rejected, (state) => {
        state.updateStatus = "failed";
      });
  },
});

export const { clearUser, setUserData } = userSlice.actions;
export default userSlice.reducer;
