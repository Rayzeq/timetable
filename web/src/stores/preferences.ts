import { createStore } from "solid-js";
import { textColorOnCustomBackground } from "~/utils/colors";
import { safelyGetInLocalStorage } from "~/utils/localstorage";

interface UserCustomization {
  primary_color?: string;
  use_fixed_height?: boolean;
}

export const DEFAULT_USER_CUSTOMIZATION: Required<UserCustomization> = {
  primary_color: "255, 66, 66",
  use_fixed_height: false,
};

export const [preferences, setPreferences] = createStore({
  username: safelyGetInLocalStorage("username", ""),
  password: safelyGetInLocalStorage("password", ""),
  customization: JSON.parse(safelyGetInLocalStorage("user_customization", "{}")) as UserCustomization,
});

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
