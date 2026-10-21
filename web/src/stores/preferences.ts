import { createStore } from "solid-js";
import { textColorOnCustomBackground } from "~/utils/colors";
import { safelyGetInLocalStorage } from "~/utils/localstorage";

interface UserCustomization {
  primary_color?: string;
}

export const DEFAULT_USER_CUSTOMIZATION: Required<UserCustomization> = {
  primary_color: "255, 66, 66",
};

export const [preferences, setPreferences] = createStore({
  username: safelyGetInLocalStorage("username", ""),
  password: safelyGetInLocalStorage("password", ""),
  customization: JSON.parse(safelyGetInLocalStorage("user_customization", "{}")) as UserCustomization,
});

/**
 * Whether the user filled in both credentials.
 * Used to avoid hitting the server with a request that is guaranteed to fail.
 */
export const hasCredentials = () => preferences.username.trim().length > 0 && preferences.password.length > 0;

export const setUsername = (username: string) => {
  localStorage.setItem("username", username);
  setPreferences((state) => {
    state.username = username;
  });
};

export const setPassword = (password: string) => {
  localStorage.setItem("password", password);
  setPreferences((state) => {
    state.password = password;
  });
};

export const setUserCustomization = (customization: UserCustomization) => {
  localStorage.setItem("user_customization", JSON.stringify(customization));
  setPreferences((state) => {
    state.customization = customization;
  });
};

/**
 * Get the current user customization, or the default one if none is set.
 */
export const getUserCustomizationKey = <T extends keyof UserCustomization>(key: T): NonNullable<UserCustomization[T]> => {
  return preferences.customization[key] ?? DEFAULT_USER_CUSTOMIZATION[key];
};

export const textColorOnBG = (reversed = false) => textColorOnCustomBackground(getUserCustomizationKey("primary_color"), reversed);
