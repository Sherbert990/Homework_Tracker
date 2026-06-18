import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DisplayUnitProvider } from "./contexts/DisplayUnitContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import LogEntry from "./pages/LogEntry";
import History from "./pages/History";
import Rewards from "./pages/Rewards";
import Settings from "./pages/Settings";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/log" component={LogEntry} />
      <Route path="/log/:date" component={LogEntry} />
      <Route path="/history" component={History} />
      <Route path="/rewards" component={Rewards} />
      <Route path="/settings" component={Settings} />
      <Route path="/about" component={About} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <DisplayUnitProvider>
          <TooltipProvider>
            <Toaster richColors position="top-center" />
            <Router />
          </TooltipProvider>
        </DisplayUnitProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
