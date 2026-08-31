import { onSettled } from "solid-js";
import type { Component } from "solid-js";
import { useNavigate } from "@solidjs/router";

const Page: Component = () => {
  const navigate = useNavigate();

  onSettled(() => {
    navigate("/", { replace: true });
  });

  return null;
};

export default Page;
